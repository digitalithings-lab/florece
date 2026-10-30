import { ConflictException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AppointmentSource, Psychologist } from "@prisma/client";
import { DateTime } from "luxon";
import { ACTIVE_APPOINTMENT, CareService, parseBirthDate } from "../care/care.service";
import { todayIn } from "../common/schedule";
import { SmsService } from "../notify/sms.service";
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
    private readonly sms: SmsService,
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

    // Misma reserva que la app: bloquea la agenda y no permite tomar una hora ocupada.
    const appointment = await this.care.reserveSlot(psychologist, startsAt, {
      patientId: null,
      source: AppointmentSource.WEB,
      notesForPsychologist: dto.reason,
      patientFullName: dto.fullName,
      patientIdNumber: dto.idNumber?.toUpperCase() ?? null,
      patientBirthDate: birthDate,
      guestEmail: dto.email,
      guestPhone: dto.phone,
    });

    const smsSent = await this.notifyPsychologist(psychologist, dto, startsAt);

    return {
      id: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointment.status,
      timezone: psychologist.timezone,
      psychologistNotified: smsSent,
    };
  }

  private async notifyPsychologist(psychologist: Psychologist, dto: PublicBookDto, startsAt: Date) {
    if (!psychologist.notifyPhone) return false;
    const when = DateTime.fromJSDate(startsAt, { zone: psychologist.timezone }).setLocale("es").toFormat("cccc d 'de' LLLL, HH:mm");
    const reason = dto.reason.length > 140 ? `${dto.reason.slice(0, 137)}…` : dto.reason;
    const body = [
      "Nueva cita solicitada desde tu web",
      `${dto.fullName} · ${dto.phone}`,
      when,
      `Motivo: ${reason}`,
      "Confírmala en tu panel de Florece.",
    ].join("\n");
    const sent = await this.sms.send(psychologist.notifyPhone, body);
    if (!sent) this.logger.warn(`Cita web creada sin aviso por SMS (psicólogo ${psychologist.id})`);
    return sent;
  }

  private async requirePublic(slug: string) {
    const psychologist = await this.prisma.psychologist.findUnique({ where: { publicSlug: slug.toLowerCase() } });
    if (!psychologist || !psychologist.publicBookingEnabled || !psychologist.active) {
      throw new NotFoundException("Esta agenda no está disponible");
    }
    return psychologist;
  }
}
