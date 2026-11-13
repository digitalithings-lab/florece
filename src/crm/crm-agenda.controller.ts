import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query,
  ServiceUnavailableException, UnauthorizedException,
} from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf, ValidateNested, IsUrl } from "class-validator";
import { Appointment, AppointmentModality, AppointmentSource, AppointmentStatus, ClientType, Psychologist } from "@prisma/client";
import { randomUUID, timingSafeEqual } from "crypto";
import { ACTIVE_APPOINTMENT, CareService, parseBirthDate } from "../care/care.service";
import { cleanText } from "../common/text";
import { config } from "../config";
import { Public } from "../common/auth.decorators";
import { BookingEmailData, cancellationEmail, confirmationEmail } from "../notify/booking-email";
import { MailService } from "../notify/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { AppointmentActionDto, AvailabilityRulesDto, BlockDto, UpdatePsyProfileDto } from "../psy/dto/psy.dto";
import { PsyService } from "../psy/psy.service";

const MAX_DAYS = 62;

function ageOn(birthDate: Date, on: Date): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const before =
    on.getUTCMonth() < birthDate.getUTCMonth() ||
    (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
  if (before) age -= 1;
  return age;
}

// Acciones que acepta el CRM sobre una cita. «resend» solo reenvía el correo de confirmación.
export class CrmActionDto {
  @IsIn(["confirm", "cancel", "complete", "no_show", "update", "resend"])
  action: "confirm" | "cancel" | "complete" | "no_show" | "update" | "resend";

  @IsOptional() @IsString() @MaxLength(500) cancelReason?: string;

  @IsOptional() @ValidateIf((_o, v) => v !== "") @IsUrl({}, { message: "El enlace de videollamada no es válido" }) meetingUrl?: string;

  // En una cancelación: avisar o no a la persona por correo (por defecto sí).
  @IsOptional() @IsBoolean() notify?: boolean;
}

// Persona de una cita creada desde el CRM. Solo el nombre es obligatorio: lo demás se completa después en el expediente.
class CrmPersonDto {
  @IsString() @Length(3, 120, { message: "Escribe el nombre completo" }) fullName: string;
  @IsOptional() @ValidateIf((_o, v) => v !== "") @IsEmail({}, { message: "El correo no es válido" }) email?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== "") @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: "Escribe un teléfono válido" }) phone?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== "") @Matches(/^[A-Za-z0-9.\- ]{4,30}$/, { message: "Escribe una cédula válida" }) idNumber?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== "") @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "La fecha de nacimiento debe ser AAAA-MM-DD" }) birthDate?: string;
}

// Cita creada a mano desde el CRM (por teléfono, WhatsApp, en persona…).
export class CrmCreateDto extends CrmPersonDto {
  @IsISO8601({ strict: true }) startsAt: string;
  // Fuera del horario de atención: se permite siempre que no choque con otra cita.
  @IsOptional() @IsBoolean() force?: boolean;
  @IsOptional() @IsIn(["VIDEO", "IN_PERSON"]) modality?: "VIDEO" | "IN_PERSON";
  @IsOptional() @IsIn(["INDIVIDUAL", "COUPLE", "CHILD"]) clientType?: "INDIVIDUAL" | "COUPLE" | "CHILD";
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ValidateIf((o) => o.clientType === "COUPLE") @ValidateNested() @Type(() => CrmPersonDto) partner?: CrmPersonDto;
}

// API para el CRM (crmespacio). Solo con la llave de servicio (x-api-key = CRM_API_KEY); sin llave configurada, queda apagada.
// Es la misma lógica que usa el panel de Florece: el CRM solo cambia la pantalla.
@Controller("crm")
@Public()
export class CrmAgendaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly psy: PsyService,
    private readonly mail: MailService,
    private readonly care: CareService,
  ) {}

  private guard(key: string | undefined) {
    const expected = config.crm.apiKey;
    if (!expected) throw new ServiceUnavailableException("Falta configurar CRM_API_KEY en Florece");
    const a = Buffer.from(key ?? "");
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException("Llave de servicio no válida");
  }

  /** La psicóloga de la agenda pública (la de la web); si no hay, la primera activa. */
  private async owner(): Promise<Psychologist> {
    const psychologist =
      (await this.prisma.psychologist.findFirst({ where: { active: true, publicSlug: { not: null } }, orderBy: { createdAt: "asc" } })) ??
      (await this.prisma.psychologist.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } }));
    if (!psychologist) throw new NotFoundException("No hay una psicóloga configurada");
    return psychologist;
  }

  private item(c: Appointment, timezone: string) {
    return {
      id: c.id,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      status: c.status,
      modality: c.modality,
      meetingUrl: c.meetingUrl,
      note: c.notesForPsychologist,
      cancelReason: c.cancelReason,
      clientType: c.clientType,
      crmGroupId: c.crmGroupId,
      priceCents: c.priceCents,
      currency: c.currency,
      paid: !!c.paymentRef,
      timezone,
      patient: {
        fullName: c.patientFullName,
        idNumber: c.patientIdNumber,
        age: c.patientBirthDate ? ageOn(c.patientBirthDate, c.startsAt) : null,
        email: c.guestEmail,
        phone: c.guestPhone,
      },
      partner:
        c.clientType === "COUPLE" && c.partnerFullName
          ? {
              fullName: c.partnerFullName,
              idNumber: c.partnerIdNumber,
              age: c.partnerBirthDate ? ageOn(c.partnerBirthDate, c.startsAt) : null,
              email: c.partnerEmail,
              phone: c.partnerPhone,
            }
          : null,
    };
  }

  // ─── Citas ───────────────────────────────────────────

  @Get("agenda")
  async agenda(@Headers("x-api-key") key: string | undefined, @Query("from") from?: string, @Query("to") to?: string) {
    this.guard(key);
    const start = from ? new Date(from) : null;
    const end = to ? new Date(to) : null;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException("Indica un rango de fechas válido (from y to)");
    }
    if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_DAYS) throw new BadRequestException(`El rango máximo es de ${MAX_DAYS} días`);

    const owner = await this.owner();
    const list = await this.prisma.appointment.findMany({
      where: { startsAt: { gte: start, lt: end }, status: { not: AppointmentStatus.PENDING_PAYMENT } },
      orderBy: { startsAt: "asc" },
      take: 500,
    });
    return list.map((c) => this.item(c, owner.timezone));
  }

  @Get("agenda/:id")
  async one(@Headers("x-api-key") key: string | undefined, @Param("id", ParseUUIDPipe) id: string) {
    this.guard(key);
    const owner = await this.owner();
    const c = await this.prisma.appointment.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("La cita no existe");
    return this.item(c, owner.timezone);
  }

  // Confirmar, cancelar, cerrar o cambiar el enlace. Es la misma acción del panel de Florece, y además envía los correos.
  @Patch("agenda/:id")
  async act(@Headers("x-api-key") key: string | undefined, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CrmActionDto) {
    this.guard(key);
    const appointment = await this.prisma.appointment.findUnique({ where: { id }, include: { psychologist: true } });
    if (!appointment) throw new NotFoundException("La cita no existe");
    const psychologist = appointment.psychologist;
    let correo: "enviado" | "sin_correo" | "no_configurado" | "error" | "omitido" = "omitido";

    if (dto.action === "resend") {
      if (appointment.status !== AppointmentStatus.CONFIRMED) throw new BadRequestException("La cita aún no está confirmada");
      correo = await this.sendConfirmation(appointment, psychologist);
    } else {
      await this.psy.actOnAppointment(psychologist.userId, id, {
        action: dto.action,
        cancelReason: dto.cancelReason,
        meetingUrl: dto.meetingUrl,
      } as AppointmentActionDto);
      const updated = await this.prisma.appointment.findUniqueOrThrow({ where: { id } });
      if (dto.action === "confirm") correo = await this.sendConfirmation(updated, psychologist);
      if (dto.action === "cancel" && dto.notify !== false) correo = await this.sendCancellation(updated, psychologist, dto.cancelReason ?? "");
      return { appointment: this.item(updated, psychologist.timezone), correo };
    }
    const fresh = await this.prisma.appointment.findUniqueOrThrow({ where: { id } });
    return { appointment: this.item(fresh, psychologist.timezone), correo };
  }

  private emailData(a: Appointment, p: Psychologist): BookingEmailData {
    return {
      patientName: a.patientFullName ?? "",
      patientEmail: a.guestEmail ?? "",
      patientPhone: a.guestPhone ?? "",
      reason: a.notesForPsychologist ?? "",
      modality: a.modality === "IN_PERSON" ? "IN_PERSON" : "VIDEO",
      psychologistName: p.fullName,
      timezone: p.timezone,
      sessionMinutes: p.sessionMinutes,
      startsAt: [a.startsAt],
    };
  }

  private recipients(a: Appointment): string[] {
    return [a.guestEmail, a.partnerEmail].filter((e, i, all): e is string => !!e && e.includes("@") && all.indexOf(e) === i);
  }

  private async sendConfirmation(a: Appointment, p: Psychologist) {
    const to = this.recipients(a);
    if (!to.length) return "sin_correo" as const;
    if (!this.mail.enabled) return "no_configurado" as const;
    let price: string | null = null;
    if (a.priceCents > 0) {
      try { price = new Intl.NumberFormat("es", { style: "currency", currency: a.currency.trim() }).format(a.priceCents / 100); }
      catch { price = `${(a.priceCents / 100).toFixed(2)} ${a.currency}`; }
    }
    const message = confirmationEmail({ ...this.emailData(a, p), meetingUrl: a.modality === "VIDEO" ? a.meetingUrl : null, price });
    const ok = await this.mail.send({ to, replyTo: config.mail.notifyTo[0] || config.mail.from, ...message });
    return ok ? ("enviado" as const) : ("error" as const);
  }

  private async sendCancellation(a: Appointment, p: Psychologist, reason: string) {
    const to = this.recipients(a);
    if (!to.length) return "sin_correo" as const;
    if (!this.mail.enabled) return "no_configurado" as const;
    const message = cancellationEmail(this.emailData(a, p), reason);
    const ok = await this.mail.send({ to, replyTo: config.mail.notifyTo[0] || config.mail.from, ...message });
    return ok ? ("enviado" as const) : ("error" as const);
  }

  // Horas libres de los próximos días, para elegir al crear una cita a mano.
  @Get("slots")
  async slots(@Headers("x-api-key") key: string | undefined, @Query("from") from?: string, @Query("days") days?: string) {
    this.guard(key);
    const owner = await this.owner();
    const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : new Date().toISOString().slice(0, 10);
    const count = Math.min(14, Math.max(1, Number(days) || 1));
    return { timezone: owner.timezone, sessionMinutes: owner.sessionMinutes, days: await this.care.computeSlots(owner, start, count) };
  }

  // Crear una cita desde el CRM. Queda «solicitada»; se confirma con PATCH (o el CRM la confirma de una vez).
  @Post("agenda")
  async create(@Headers("x-api-key") key: string | undefined, @Body() dto: CrmCreateDto) {
    this.guard(key);
    const owner = await this.owner();
    const startsAt = new Date(dto.startsAt);
    if (startsAt.getTime() < Date.now() - 60 * 60 * 1000) throw new BadRequestException("La fecha de la cita ya pasó");

    const clientType = (dto.clientType ?? "INDIVIDUAL") as ClientType;
    const partner = clientType === "COUPLE" ? dto.partner : undefined;
    if (clientType === "COUPLE" && !partner) throw new BadRequestException("Escribe los datos de la pareja");
    const birth = (v?: string) => (v ? parseBirthDate(v) : null);

    const data = {
      patientId: null,
      modality: dto.modality === "IN_PERSON" ? AppointmentModality.IN_PERSON : AppointmentModality.VIDEO,
      source: AppointmentSource.WEB,
      notesForPsychologist: cleanText(dto.reason ?? "", true) || "Cita creada desde el CRM",
      patientFullName: cleanText(dto.fullName),
      patientIdNumber: dto.idNumber ? dto.idNumber.toUpperCase() : null,
      patientBirthDate: birth(dto.birthDate),
      guestEmail: dto.email ? dto.email.trim().toLowerCase() : null,
      guestPhone: dto.phone?.trim() || null,
      clientType,
      partnerFullName: partner ? cleanText(partner.fullName) : null,
      partnerIdNumber: partner?.idNumber ? partner.idNumber.toUpperCase() : null,
      partnerBirthDate: birth(partner?.birthDate),
      partnerEmail: partner?.email ? partner.email.trim().toLowerCase() : null,
      partnerPhone: partner?.phone?.trim() || null,
      crmGroupId: partner ? randomUUID() : null,
    };

    let created: Appointment;
    if (!dto.force) {
      // Solo horas libres del horario de atención (igual que la agenda pública)
      created = await this.care.reserveSlot(owner, startsAt, data);
    } else {
      const endsAt = new Date(startsAt.getTime() + owner.sessionMinutes * 60_000);
      const overlap = await this.prisma.appointment.findFirst({
        where: { psychologistId: owner.id, status: { in: ACTIVE_APPOINTMENT }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      });
      if (overlap) throw new ConflictException("Ya hay una cita en ese horario");
      created = await this.prisma.appointment.create({
        data: { ...data, psychologistId: owner.id, startsAt, endsAt, status: AppointmentStatus.REQUESTED, priceCents: owner.sessionPriceCents, currency: owner.currency },
      });
    }
    return { appointment: this.item(created, owner.timezone) };
  }

  // ─── Ajustes: perfil, horarios y bloqueos ─────────────

  private async settings(p: Psychologist) {
    const profile = await this.psy.me(p.userId);
    const availability = await this.psy.availability(p.userId);
    return { profile, rules: availability.rules, blocks: availability.blocks };
  }

  @Get("ajustes")
  async getSettings(@Headers("x-api-key") key: string | undefined) {
    this.guard(key);
    return this.settings(await this.owner());
  }

  @Put("ajustes/perfil")
  async putProfile(@Headers("x-api-key") key: string | undefined, @Body() dto: UpdatePsyProfileDto) {
    this.guard(key);
    const p = await this.owner();
    await this.psy.updateMe(p.userId, dto);
    return this.settings(p);
  }

  @Put("ajustes/horarios")
  async putRules(@Headers("x-api-key") key: string | undefined, @Body() dto: AvailabilityRulesDto) {
    this.guard(key);
    const p = await this.owner();
    await this.psy.setRules(p.userId, dto.rules);
    return this.settings(p);
  }

  @Post("ajustes/bloqueos")
  async addBlock(@Headers("x-api-key") key: string | undefined, @Body() dto: BlockDto) {
    this.guard(key);
    const p = await this.owner();
    await this.psy.addBlock(p.userId, dto);
    return this.settings(p);
  }

  @Delete("ajustes/bloqueos/:id")
  async removeBlock(@Headers("x-api-key") key: string | undefined, @Param("id", ParseUUIDPipe) id: string) {
    this.guard(key);
    const p = await this.owner();
    await this.psy.removeBlock(p.userId, id);
    return this.settings(p);
  }
}
