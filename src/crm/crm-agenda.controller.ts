import { Controller, Get, Headers, Query, UnauthorizedException, BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import { config } from "../config";
import { Public } from "../common/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";

const MAX_DAYS = 62;

function ageOn(birthDate: Date, on: Date): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const before =
    on.getUTCMonth() < birthDate.getUTCMonth() ||
    (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
  if (before) age -= 1;
  return age;
}

// Agenda para el CRM (crmespacio). Solo con la llave de servicio (x-api-key = CRM_API_KEY); sin llave configurada, queda apagada.
@Controller("crm")
@Public()
export class CrmAgendaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("agenda")
  async agenda(@Headers("x-api-key") key: string | undefined, @Query("from") from?: string, @Query("to") to?: string) {
    const expected = config.crm.apiKey;
    if (!expected) throw new ServiceUnavailableException("Falta configurar CRM_API_KEY en Florece");
    const a = Buffer.from(key ?? "");
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException("Llave de servicio no válida");

    const start = from ? new Date(from) : null;
    const end = to ? new Date(to) : null;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException("Indica un rango de fechas válido (from y to)");
    }
    if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_DAYS) throw new BadRequestException(`El rango máximo es de ${MAX_DAYS} días`);

    const list = await this.prisma.appointment.findMany({
      where: { startsAt: { gte: start, lt: end }, status: { not: "PENDING_PAYMENT" } },
      orderBy: { startsAt: "asc" },
      take: 500,
    });

    return list.map((c) => ({
      id: c.id,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      status: c.status,
      modality: c.modality,
      meetingUrl: c.meetingUrl,
      note: c.notesForPsychologist,
      clientType: c.clientType,
      priceCents: c.priceCents,
      currency: c.currency,
      paid: !!c.paymentRef,
      patient: {
        fullName: c.patientFullName,
        idNumber: c.patientIdNumber,
        age: c.patientBirthDate ? ageOn(c.patientBirthDate, c.startsAt) : null,
        email: c.guestEmail,
        phone: c.guestPhone,
      },
      partner:
        c.clientType === "COUPLE" && c.partnerFullName
          ? { fullName: c.partnerFullName, idNumber: c.partnerIdNumber, email: c.partnerEmail, phone: c.partnerPhone }
          : null,
    }));
  }
}
