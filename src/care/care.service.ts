import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  Appointment,
  AppointmentCanceller,
  AppointmentModality,
  AppointmentStatus,
  CareLinkStatus,
  Prisma,
  Psychologist,
  UserRole,
} from "@prisma/client";
import { DateTime } from "luxon";
import { normalizeLinkCode } from "../common/link-code";
import { BusyRange, freeSlots, todayIn } from "../common/schedule";
import { config } from "../config";
import { PsychologistNotifier } from "../notify/psychologist-notifier.service";
import { PrismaService } from "../prisma/prisma.service";
import { BookAppointmentDto } from "./dto/care.dto";

// Citas que ocupan un horario.
export const ACTIVE_APPOINTMENT: AppointmentStatus[] = [AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED];

@Injectable()
export class CareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: PsychologistNotifier,
  ) {}

  async current(userId: string) {
    const link = await this.activeLink(userId);
    if (!link) return { linked: false as const };

    const nextAppointment = await this.prisma.appointment.findFirst({
      where: { patientId: userId, psychologistId: link.psychologistId, status: { in: ACTIVE_APPOINTMENT }, endsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
    });

    return {
      linked: true as const,
      linkedAt: link.createdAt,
      psychologist: this.publicPsychologist(link.psychologist),
      nextAppointment: nextAppointment && this.formatAppointment(nextAppointment),
    };
  }

  // Muestra a quién pertenece un código antes de vincularse.
  async preview(code: string) {
    return this.publicPsychologist(await this.findByCode(code));
  }

  async link(userId: string, role: string, code: string) {
    if (role !== UserRole.USER) {
      throw new ForbiddenException("Solo las cuentas de paciente pueden vincularse con un psicólogo");
    }
    const psychologist = await this.findByCode(code);

    if (await this.activeLink(userId)) {
      throw new ConflictException("Ya tienes un psicólogo vinculado. Desvincúlate primero para cambiar.");
    }
    await this.prisma.careLink.create({ data: { patientId: userId, psychologistId: psychologist.id } });
    return this.current(userId);
  }

  async unlink(userId: string) {
    const link = await this.activeLink(userId);
    if (!link) throw new NotFoundException("No tienes un psicólogo vinculado");

    await this.prisma.$transaction([
      this.prisma.careLink.update({ where: { id: link.id }, data: { status: CareLinkStatus.ENDED, endedAt: new Date() } }),
      // Las citas futuras con ese psicólogo se cancelan.
      this.prisma.appointment.updateMany({
        where: { patientId: userId, psychologistId: link.psychologistId, status: { in: ACTIVE_APPOINTMENT }, startsAt: { gt: new Date() } },
        data: { status: AppointmentStatus.CANCELLED, cancelledAt: new Date(), cancelReason: "La persona se desvinculó", cancelledBy: AppointmentCanceller.PATIENT },
      }),
      // Y sus rutinas dejan de aparecer.
      this.prisma.routine.updateMany({
        where: { patientId: userId, psychologistId: link.psychologistId, active: true },
        data: { active: false },
      }),
    ]);
    return { linked: false as const };
  }

  async slots(userId: string, from: string | undefined, days: number) {
    const psychologist = await this.requireLinkedPsychologist(userId);
    return {
      timezone: psychologist.timezone,
      sessionMinutes: psychologist.sessionMinutes,
      days: await this.computeSlots(psychologist, from ?? todayIn(psychologist.timezone), days),
    };
  }

  async bookingDetails(userId: string) {
    const [last, user] = await Promise.all([
      this.prisma.appointment.findFirst({
        where: { patientId: userId, patientFullName: { not: null } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    ]);
    const birthDate = last?.patientBirthDate ?? user?.birthDate ?? null;
    return {
      fullName: last?.patientFullName ?? user?.profile?.displayName ?? "",
      idNumber: last?.patientIdNumber ?? "",
      birthDate: birthDate ? birthDate.toISOString().slice(0, 10) : "",
    };
  }

  async book(userId: string, dto: BookAppointmentDto) {
    const psychologist = await this.requireLinkedPsychologist(userId);
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException("La fecha no es válida");

    const birthDate = parseBirthDate(dto.birthDate);

    const appointment = await this.reserveSlot(psychologist, startsAt, {
      patientId: userId,
      notesForPsychologist: dto.reason.trim(),
      patientFullName: dto.fullName.trim(),
      patientIdNumber: dto.idNumber.trim().toUpperCase(),
      patientBirthDate: birthDate,
    });

    // Aviso al psicólogo por WhatsApp o SMS; si falla, la cita igual queda creada.
    const when = DateTime.fromJSDate(startsAt, { zone: psychologist.timezone }).setLocale("es").toFormat("cccc d 'de' LLLL, h:mm a");
    const reason = dto.reason.trim();
    await this.notifier.notify(
      psychologist,
      [
        "📅 *Nueva cita solicitada desde la app*",
        `*${dto.fullName.trim()}*`,
        when,
        `Motivo: ${reason.length > 140 ? `${reason.slice(0, 137)}…` : reason}`,
        "Confírmala en tu panel de Florece.",
      ].join("\n"),
      { title: "📅 Nueva cita desde la app", body: `${dto.fullName.trim()} · ${when}`, url: "/agenda" },
    );

    return this.formatAppointment(appointment);
  }

  async appointments(userId: string) {
    const list = await this.prisma.appointment.findMany({
      where: { patientId: userId },
      orderBy: { startsAt: "desc" },
      take: 50,
      include: { psychologist: true },
    });
    const now = new Date();
    const format = (a: (typeof list)[number]) => ({ ...this.formatAppointment(a), psychologistName: a.psychologist.fullName });
    return {
      upcoming: list.filter((a) => a.endsAt > now && ACTIVE_APPOINTMENT.includes(a.status)).reverse().map(format),
      past: list.filter((a) => !(a.endsAt > now && ACTIVE_APPOINTMENT.includes(a.status))).map(format),
    };
  }

  async cancel(userId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({ where: { id: appointmentId, patientId: userId } });
    if (!appointment) throw new NotFoundException("La cita no existe");
    if (!ACTIVE_APPOINTMENT.includes(appointment.status)) throw new ConflictException("Esta cita ya no está activa");

    const hoursLeft = (appointment.startsAt.getTime() - Date.now()) / 3_600_000;
    if (hoursLeft < config.cancelMinHours) {
      throw new BadRequestException(
        `Solo puedes cancelar con al menos ${config.cancelMinHours} horas de anticipación. Escríbele a tu psicólogo, por favor.`,
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CANCELLED, cancelledAt: new Date(), cancelReason: "Cancelada por la persona", cancelledBy: AppointmentCanceller.PATIENT },
    });
    return this.formatAppointment(updated);
  }

  // ─── Auxiliares ──────────────────────────────────────

  /**
   * Reserva una hora: bloquea la agenda del psicólogo, comprueba que la hora siga libre (sin otra cita,
   * bloqueo ni fuera de horario) y crea la cita como solicitud. Lo usan la app y la agenda pública de la web.
   */
  async reserveSlot(
    psychologist: Psychologist,
    startsAt: Date,
    data: Omit<Prisma.AppointmentUncheckedCreateInput, "psychologistId" | "startsAt" | "endsAt" | "status" | "priceCents" | "currency">,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Bloqueo por psicólogo: dos reservas simultáneas no pueden tomar el mismo horario.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${psychologist.id}`}))`;

      const day = await this.computeSlots(psychologist, isoDateIn(startsAt, psychologist.timezone), 1);
      const slot = day[0]?.slots.find((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
      if (!slot) {
        throw new ConflictException("Ese horario ya no está disponible. Elige otro, por favor.");
      }

      return tx.appointment.create({
        data: {
          modality: AppointmentModality.VIDEO,
          ...data,
          psychologistId: psychologist.id,
          startsAt,
          endsAt: new Date(slot.endsAt),
          status: AppointmentStatus.REQUESTED,
          priceCents: psychologist.sessionPriceCents,
          currency: psychologist.currency,
        },
      });
    });
  }

  async computeSlots(psychologist: Psychologist, fromDate: string, days: number) {
    // Ventana holgada (un día antes y dos después) para cubrir cualquier zona horaria.
    const windowStart = new Date(new Date(`${fromDate}T00:00:00Z`).getTime() - 86_400_000);
    const windowEnd = new Date(windowStart.getTime() + (days + 3) * 86_400_000);

    const [rules, blocks, taken] = await Promise.all([
      this.prisma.availabilityRule.findMany({ where: { psychologistId: psychologist.id } }),
      this.prisma.availabilityBlock.findMany({
        where: { psychologistId: psychologist.id, endsAt: { gt: windowStart }, startsAt: { lt: windowEnd } },
      }),
      this.prisma.appointment.findMany({
        where: { psychologistId: psychologist.id, status: { in: ACTIVE_APPOINTMENT }, endsAt: { gt: windowStart }, startsAt: { lt: windowEnd } },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    const busy: BusyRange[] = [...blocks, ...taken];
    return freeSlots({
      rules,
      busy,
      timezone: psychologist.timezone,
      sessionMinutes: psychologist.sessionMinutes,
      bufferMinutes: psychologist.bufferMinutes,
      fromDate,
      days,
      minNoticeHours: config.bookingMinHours,
    });
  }

  private activeLink(userId: string) {
    return this.prisma.careLink.findFirst({
      where: { patientId: userId, status: CareLinkStatus.ACTIVE },
      include: { psychologist: true },
    });
  }

  private async requireLinkedPsychologist(userId: string) {
    const link = await this.activeLink(userId);
    if (!link) throw new NotFoundException("Primero vincúlate con tu psicólogo");
    if (!link.psychologist.active) throw new ForbiddenException("Tu psicólogo no está disponible por ahora");
    return link.psychologist;
  }

  private async findByCode(code: string) {
    const psychologist = await this.prisma.psychologist.findUnique({ where: { linkCode: normalizeLinkCode(code) } });
    if (!psychologist || !psychologist.active) {
      throw new NotFoundException("No encontramos ese código. Revísalo con tu psicólogo.");
    }
    return psychologist;
  }

  private publicPsychologist(p: Psychologist) {
    return {
      id: p.id,
      fullName: p.fullName,
      specialties: p.specialties,
      bio: p.bio,
      photoUrl: p.photoUrl,
      sessionMinutes: p.sessionMinutes,
      sessionPriceCents: p.sessionPriceCents,
      currency: p.currency,
      timezone: p.timezone,
    };
  }

  formatAppointment(a: Appointment) {
    return {
      id: a.id,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      modality: a.modality,
      // El enlace solo se muestra una vez confirmada la cita.
      meetingUrl: a.status === AppointmentStatus.CONFIRMED ? a.meetingUrl : null,
      note: a.notesForPsychologist,
      cancelReason: a.cancelReason,
      cancelledBy: a.cancelledBy,
    };
  }
}

// Fecha de nacimiento real (AAAA-MM-DD) de alguien con entre 5 y 120 años.
export function parseBirthDate(value: string): Date {
  const birthDate = new Date(`${value}T00:00:00Z`);
  const age = (Date.now() - birthDate.getTime()) / (365.25 * 24 * 3_600_000);
  if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== value || age < 5 || age > 120) {
    throw new BadRequestException("Revisa tu fecha de nacimiento");
  }
  return birthDate;
}

export function isoDateIn(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
