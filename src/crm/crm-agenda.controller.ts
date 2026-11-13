import {
  BadRequestException, Body, Controller, Delete, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query,
  ServiceUnavailableException, UnauthorizedException,
} from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf, IsUrl } from "class-validator";
import { Appointment, AppointmentStatus, Psychologist } from "@prisma/client";
import { timingSafeEqual } from "crypto";
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

// API para el CRM (crmespacio). Solo con la llave de servicio (x-api-key = CRM_API_KEY); sin llave configurada, queda apagada.
// Es la misma lógica que usa el panel de Florece: el CRM solo cambia la pantalla.
@Controller("crm")
@Public()
export class CrmAgendaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly psy: PsyService,
    private readonly mail: MailService,
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
