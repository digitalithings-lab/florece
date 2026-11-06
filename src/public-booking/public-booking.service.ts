import { randomUUID } from "crypto";
import { ConflictException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Appointment, AppointmentModality, AppointmentSource, AppointmentStatus, Psychologist } from "@prisma/client";
import { DateTime } from "luxon";
import { ACTIVE_APPOINTMENT, CareService, parseBirthDate } from "../care/care.service";
import { isoDateIn, todayIn } from "../common/schedule";
import { BookingEmailData, patientEmail, psychologistEmail } from "../notify/booking-email";
import { MailService } from "../notify/mail.service";
import { config } from "../config";
import { PsychologistNotifier } from "../notify/psychologist-notifier.service";
import { PrismaService } from "../prisma/prisma.service";
import { PublicBookDto } from "./dto/public-booking.dto";

// Máximo de solicitudes pendientes por correo, para frenar abusos.
const MAX_PENDING_PER_EMAIL = 3;

const toHHmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

// Agenda pública: cualquier persona, sin cuenta, ve el horario del psicólogo y pide una cita.
@Injectable()
export class PublicBookingService {
  private readonly logger = new Logger(PublicBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly care: CareService,
    private readonly notifier: PsychologistNotifier,
    private readonly mail: MailService,
  ) {}

  async info(slug: string, from?: string, days = 21) {
    const psychologist = await this.requirePublic(slug);
    const rules = await this.prisma.availabilityRule.findMany({
      where: { psychologistId: psychologist.id },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
    });

    // Horario semanal agrupado por día: lunes → domingo.
    const weekly = [1, 2, 3, 4, 5, 6, 0]
      .map((weekday) => ({
        weekday,
        ranges: rules.filter((r) => r.weekday === weekday).map((r) => ({ start: toHHmm(r.startMinute), end: toHHmm(r.endMinute) })),
      }))
      .filter((d) => d.ranges.length > 0);

    return {
      psychologist: {
        fullName: psychologist.fullName,
        specialties: psychologist.specialties,
        photoUrl: psychologist.photoUrl,
        sessionMinutes: psychologist.sessionMinutes,
        sessionPriceCents: psychologist.sessionPriceCents,
        currency: psychologist.currency,
        timezone: psychologist.timezone,
      },
      weekly,
      days: await this.care.computeSlots(psychologist, from ?? todayIn(psychologist.timezone), days),
    };
  }

  async book(slug: string, dto: PublicBookDto) {
    const psychologist = await this.requirePublic(slug);
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException("La fecha no es válida");
    const birthDate = dto.birthDate ? parseBirthDate(dto.birthDate) : null;

    const pending = await this.prisma.appointment.count({
      where: { psychologistId: psychologist.id, guestEmail: dto.email, status: { in: ACTIVE_APPOINTMENT }, startsAt: { gt: new Date() } },
    });
    if (pending >= MAX_PENDING_PER_EMAIL) {
      throw new ConflictException("Ya tienes varias citas pendientes. Espera la confirmación o escríbenos para cambiarlas.");
    }

    if (dto.recurrence) {
      return this.bookRecurring(psychologist, startsAt, dto, birthDate);
    }

    // Misma reserva que la app: bloquea la agenda y no permite tomar una hora ocupada.
    const appointment = await this.care.reserveSlot(psychologist, startsAt, {
      patientId: null,
      modality: dto.modality === "IN_PERSON" ? AppointmentModality.IN_PERSON : AppointmentModality.VIDEO,
      source: AppointmentSource.WEB,
      notesForPsychologist: dto.reason,
      patientFullName: dto.fullName,
      patientIdNumber: dto.idNumber?.toUpperCase() ?? null,
      patientBirthDate: birthDate,
      guestEmail: dto.email,
      guestPhone: dto.phone,
    });

    const notifiedBy = await this.notifyPsychologist(psychologist, dto, startsAt);
    const emailed = await this.sendEmails(psychologist, dto, birthDate, [appointment.startsAt]);

    return {
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      timezone: psychologist.timezone,
      psychologistNotified: notifiedBy !== null,
      emailed,
    };
  }

  private nextOccurrence(date: Date, rule: "weekly" | "biweekly"): Date {
    const days = rule === "weekly" ? 7 : 14;
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private async bookRecurring(psychologist: Psychologist, startsAt: Date, dto: PublicBookDto, birthDate: Date | null) {
    const { rule, count } = dto.recurrence!;
    const groupId = randomUUID();
    const dates: Date[] = [startsAt];
    for (let i = 1; i < count; i++) {
      dates.push(this.nextOccurrence(dates[i - 1], rule));
    }

    const appointments = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${psychologist.id}`}))`;

      const results: Appointment[] = [];
      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const day = await this.care.computeSlots(psychologist, isoDateIn(d, psychologist.timezone), 1);
        const slot = day[0]?.slots.find((s) => new Date(s.startsAt).getTime() === d.getTime());
        if (!slot) continue;

        const created = await tx.appointment.create({
          data: {
            modality: dto.modality === "IN_PERSON" ? AppointmentModality.IN_PERSON : AppointmentModality.VIDEO,
            patientId: null,
            source: AppointmentSource.WEB,
            notesForPsychologist: dto.reason,
            patientFullName: dto.fullName,
            patientIdNumber: dto.idNumber?.toUpperCase() ?? null,
            patientBirthDate: birthDate,
            guestEmail: dto.email,
            guestPhone: dto.phone,
            psychologistId: psychologist.id,
            startsAt: d,
            endsAt: new Date(slot.endsAt),
            status: AppointmentStatus.REQUESTED,
            priceCents: psychologist.sessionPriceCents,
            currency: psychologist.currency,
            recurrenceGroupId: groupId,
            recurrenceRule: rule,
            recurrenceIndex: i,
          },
        });
        results.push(created);
      }
      return results;
    });

    if (appointments.length === 0) {
      throw new ConflictException("No se pudieron reservar las citas en esas fechas. Intenta elegir otros horarios.");
    }

    const first = appointments[0];
    const ruleLabel = rule === "weekly" ? "semanales" : "cada 2 semanas";
    const when = DateTime.fromJSDate(first.startsAt, { zone: psychologist.timezone }).setLocale("es").toFormat("cccc d 'de' LLLL, h:mm a");
    const reason = dto.reason.length > 140 ? `${dto.reason.slice(0, 137)}…` : dto.reason;
    const body = [
      `📅 *Nueva serie de ${appointments.length} citas recurrentes (${ruleLabel}) desde tu web*`,
      `*${dto.fullName}* · ${dto.phone}`,
      `Primera cita: ${when}`,
      `Motivo: ${reason}`,
      "Confírmalas en tu panel de Florece.",
    ].join("\n");
    const channel = await this.notifier.notify(psychologist, body, {
      title: "📅 Citas recurrentes desde tu web",
      body: `${dto.fullName} · ${appointments.length} citas`,
      url: "/agenda",
    });

    const emailed = await this.sendEmails(psychologist, dto, birthDate, appointments.map((a) => a.startsAt), ruleLabel);

    return {
      recurring: true as const,
      count: appointments.length,
      rule,
      timezone: psychologist.timezone,
      psychologistNotified: channel !== null,
      emailed,
      appointments: appointments.map((a) => ({
        id: a.id,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status,
        recurrenceIndex: a.recurrenceIndex,
      })),
    };
  }

  /** Correo de confirmación a la persona y aviso a la psicóloga. Un fallo de correo nunca afecta la cita. */
  private async sendEmails(psychologist: Psychologist, dto: PublicBookDto, birthDate: Date | null, startsAt: Date[], seriesLabel?: string) {
    const data: BookingEmailData = {
      patientName: dto.fullName,
      patientEmail: dto.email,
      patientPhone: dto.phone,
      idNumber: dto.idNumber?.toUpperCase() ?? null,
      birthDate: birthDate ? birthDate.toISOString().slice(0, 10) : null,
      reason: dto.reason,
      modality: dto.modality === "IN_PERSON" ? "IN_PERSON" : "VIDEO",
      psychologistName: psychologist.fullName,
      timezone: psychologist.timezone,
      sessionMinutes: psychologist.sessionMinutes,
      startsAt,
      seriesLabel,
    };
    const toPatient = patientEmail(data);
    const toPsy = psychologistEmail(data);
    const replyTo = config.mail.notifyTo[0] || config.mail.from;
    const [patient, psy] = await Promise.all([
      this.mail.send({ to: dto.email, replyTo, ...toPatient }),
      config.mail.notifyTo.length > 0 ? this.mail.send({ to: config.mail.notifyTo, replyTo: dto.email, ...toPsy }) : Promise.resolve(false),
    ]);
    return { patient, psychologist: psy };
  }

  private async notifyPsychologist(psychologist: Psychologist, dto: PublicBookDto, startsAt: Date) {
    const when = DateTime.fromJSDate(startsAt, { zone: psychologist.timezone }).setLocale("es").toFormat("cccc d 'de' LLLL, h:mm a");
    const reason = dto.reason.length > 140 ? `${dto.reason.slice(0, 137)}…` : dto.reason;
    const body = [
      "📅 *Nueva cita solicitada desde tu web*",
      `*${dto.fullName}* · ${dto.phone}`,
      `${when} · ${dto.modality === "IN_PERSON" ? "Presencial" : "Virtual"}`,
      `Motivo: ${reason}`,
      "Confírmala en tu panel de Florece.",
    ].join("\n");
    const channel = await this.notifier.notify(psychologist, body, {
      title: "📅 Nueva cita desde tu web",
      body: `${dto.fullName} · ${when}`,
      url: "/agenda",
    });
    if (!channel) this.logger.warn(`Cita web creada sin aviso al psicólogo ${psychologist.id}`);
    return channel;
  }

  private async requirePublic(slug: string) {
    const psychologist = await this.prisma.psychologist.findUnique({ where: { publicSlug: slug.toLowerCase() } });
    if (!psychologist || !psychologist.publicBookingEnabled || !psychologist.active) {
      throw new NotFoundException("Esta agenda no está disponible");
    }
    return psychologist;
  }
}
