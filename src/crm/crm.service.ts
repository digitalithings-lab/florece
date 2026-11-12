import { Injectable, Logger } from "@nestjs/common";
import { Appointment, ClientType } from "@prisma/client";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";

export interface CrmResult {
  synced: boolean;
  error: string | null;
}

interface Person {
  label: string;
  fullName: string | null;
  idNumber: string | null;
  birthDate: Date | null;
  email: string | null;
  phone: string | null;
}

// Valores que acepta el CRM en el campo «tipo» (restricción clientes_tipo_check).
const CRM_TYPE: Record<ClientType, string> = {
  INDIVIDUAL: "individual",
  COUPLE: "pareja",
  CHILD: "niños/adolescentes",
};

/** Separa «Ana María López Pérez» en nombre y apellido (el CRM los guarda por separado). */
export function splitName(fullName: string): { nombre: string; apellido: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { nombre: parts[0], apellido: "-" };
  if (parts.length === 2) return { nombre: parts[0], apellido: parts[1] };
  if (parts.length === 3) return { nombre: parts[0], apellido: parts.slice(1).join(" ") };
  return { nombre: parts.slice(0, 2).join(" "), apellido: parts.slice(2).join(" ") };
}

function ageOf(birthDate: Date, on = new Date()): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const before =
    on.getUTCMonth() < birthDate.getUTCMonth() ||
    (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
  if (before) age -= 1;
  return age;
}

// Registra en el CRM (crmespacio) a las personas de una cita confirmada. Una pareja se registra como
// dos clientes que comparten el mismo idgrupo.
@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Intenta registrar la cita en el CRM y guarda el resultado en la cita. Nunca lanza: un fallo no debe impedir confirmar. */
  async syncAppointment(appointmentId: string): Promise<CrmResult> {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) return { synced: false, error: "La cita no existe" };

    let result: CrmResult;
    try {
      result = await this.register(appointment);
    } catch (e) {
      this.logger.error(`CRM: fallo inesperado en la cita ${appointmentId}`, e as Error);
      result = { synced: false, error: "No se pudo conectar con el CRM" };
    }

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { crmSyncedAt: result.synced ? new Date() : null, crmError: result.error },
    });
    return result;
  }

  private people(a: Appointment): Person[] {
    const people: Person[] = [
      { label: "la persona 1", fullName: a.patientFullName, idNumber: a.patientIdNumber, birthDate: a.patientBirthDate, email: a.guestEmail, phone: a.guestPhone },
    ];
    if (a.clientType === ClientType.COUPLE) {
      people.push({
        label: "la pareja",
        fullName: a.partnerFullName,
        idNumber: a.partnerIdNumber,
        birthDate: a.partnerBirthDate,
        email: a.partnerEmail,
        phone: a.partnerPhone,
      });
    }
    return people;
  }

  private async register(a: Appointment): Promise<CrmResult> {
    // La llave es opcional hasta que el CRM empiece a exigirla; sin ella el CRM responderá 401 con un mensaje claro.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.crm.apiKey) headers["x-api-key"] = config.crm.apiKey;
    const people = this.people(a);

    // El CRM exige estos datos; si falta alguno, se avisa cuál para completarlo a mano.
    for (const p of people) {
      const missing = [
        !p.fullName && "nombre",
        !p.idNumber && "cédula",
        !p.birthDate && "fecha de nacimiento",
        !p.email && "correo",
        !p.phone && "teléfono",
      ].filter(Boolean);
      if (missing.length) return { synced: false, error: `Faltan datos de ${p.label} para registrarla en el CRM: ${missing.join(", ")}` };
    }

    for (const p of people) {
      const { nombre, apellido } = splitName(p.fullName!);
      const body: Record<string, unknown> = {
        nombre,
        apellido,
        correo: p.email,
        cedula: p.idNumber,
        telefono: p.phone,
        edad: Math.max(0, ageOf(p.birthDate!)),
        tipo: CRM_TYPE[a.clientType],
        reutilizar: true, // si la cédula ya está en el CRM (cliente que vuelve), se reutiliza en vez de fallar
      };
      if (a.crmGroupId) body.idgrupo = a.crmGroupId;

      const response = await fetch(`${config.crm.apiUrl}/crearcliente`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };

      // 201 = creado; 200 = ya existía esa cédula (el CRM solo le asigna el grupo). Ambos son éxito.
      if (response.ok && json.ok !== false) continue;

      const reason = json.message?.trim() || `el CRM respondió ${response.status}`;
      this.logger.warn(`CRM: no se registró a ${p.fullName}: ${reason}`);
      return { synced: false, error: `No se pudo registrar a ${p.fullName}: ${reason}` };
    }

    return this.registerCharge(a, headers);
  }

  // Crea en la billetera del CRM el cobro de la cita (precio de la sesión). Es idempotente por cita.
  // Si el pago ya se hizo en Florece (paymentRef), el cobro entra como pagado.
  private async registerCharge(a: Appointment, headers: Record<string, string>): Promise<CrmResult> {
    if (a.priceCents <= 0 || !a.patientIdNumber) return { synced: true, error: null };
    const when = a.startsAt.toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
    const body = {
      cedula: a.patientIdNumber,
      cita_ref: a.id,
      concepto: `Sesión de terapia · ${when}`,
      monto: a.priceCents / 100,
      moneda: a.currency,
      fecha_servicio: a.startsAt.toISOString(),
      pagado: !!a.paymentRef,
      metodo: a.paymentRef ? "Tarjeta (Stripe)" : undefined,
      referencia: a.paymentRef ?? undefined,
    };
    const response = await fetch(`${config.crm.apiUrl}/cobros/cita`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (response.ok && json.ok !== false) return { synced: true, error: null };
    const reason = json.message?.trim() || `el CRM respondió ${response.status}`;
    this.logger.warn(`CRM: no se creó el cobro de la cita ${a.id}: ${reason}`);
    return { synced: false, error: `Cliente registrado, pero no se creó el cobro: ${reason}` };
  }
}
