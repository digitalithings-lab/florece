import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  Appointment,
  AppointmentCanceller,
  AppointmentStatus,
  AssignedContent,
  CareLinkStatus,
  ContentKind,
  DailyChallengeStatus,
  Prisma,
  Psychologist,
  RiskLevel,
  RiskSource,
  Routine,
} from "@prisma/client";
import { DateTime } from "luxon";
import { isValidTimezone } from "../common/dates";
import { generateLinkCode } from "../common/link-code";
import { minutesToLabel } from "../common/schedule";
import { ACTIVE_APPOINTMENT } from "../care/care.service";
import { PsychologistNotifier } from "../notify/psychologist-notifier.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AppointmentActionDto,
  AppointmentsQueryDto,
  BlockDto,
  CreateContentDto,
  CreateRoutineDto,
  RuleDto,
  UpdatePsyProfileDto,
  UpdateRoutineDto,
} from "./dto/psy.dto";

const RISKY: RiskLevel[] = [RiskLevel.MODERATE, RiskLevel.HIGH, RiskLevel.IMMINENT];

@Injectable()
export class PsyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: PsychologistNotifier,
  ) {}

  // ─── Perfil ──────────────────────────────────────────

  async me(userId: string) {
    const psychologist = await this.require(userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    return { ...this.formatProfile(psychologist), email: user.email };
  }

  async updateMe(userId: string, dto: UpdatePsyProfileDto) {
    const psychologist = await this.require(userId);
    if (dto.timezone && !isValidTimezone(dto.timezone)) throw new BadRequestException("La zona horaria no es válida");

    if (dto.publicBookingEnabled && !(dto.publicSlug ?? psychologist.publicSlug)) {
      throw new BadRequestException("Elige un enlace para tu agenda pública antes de activarla");
    }

    const updated = await this.prisma.psychologist.update({
      where: { id: psychologist.id },
      data: {
        fullName: dto.fullName?.trim(),
        licenseNumber: dto.licenseNumber?.trim(),
        specialties: dto.specialties?.map((s) => s.trim()).filter(Boolean),
        bio: dto.bio === undefined ? undefined : dto.bio.trim() || null,
        photoUrl: dto.photoUrl === undefined ? undefined : dto.photoUrl || null,
        sessionPriceCents: dto.sessionPriceCents,
        currency: dto.currency,
        sessionMinutes: dto.sessionMinutes,
        timezone: dto.timezone,
        defaultMeetingUrl: dto.defaultMeetingUrl === undefined ? undefined : dto.defaultMeetingUrl || null,
        publicBookingEnabled: dto.publicBookingEnabled,
        publicSlug: dto.publicSlug === undefined ? undefined : dto.publicSlug || null,
        notifyPhone: dto.notifyPhone === undefined ? undefined : dto.notifyPhone || null,
        notifyWhatsappKey: dto.notifyWhatsappKey === undefined ? undefined : dto.notifyWhatsappKey || null,
      },
    }).catch((err: unknown) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Ese enlace ya lo usa otro psicólogo. Prueba con otro.");
      }
      throw err;
    });
    if (dto.fullName) {
      await this.prisma.profile.update({ where: { userId }, data: { displayName: dto.fullName.trim() } });
    }
    return this.formatProfile(updated);
  }

  // Envía un aviso de prueba al celular configurado, para comprobar WhatsApp o SMS.
  async testNotification(userId: string) {
    const psychologist = await this.require(userId);
    if (!psychologist.notifyPhone) throw new BadRequestException("Primero guarda tu celular para avisos");
    const channel = await this.notifier.notify(psychologist, "✅ Florece: así te llegará el aviso cuando alguien agende una cita desde tu web.");
    if (!channel) {
      throw new BadRequestException(
        psychologist.notifyWhatsappKey
          ? "No pudimos enviarte el WhatsApp. Revisa que el celular y la clave de CallMeBot sean correctos."
          : "Agrega tu clave de CallMeBot para recibir avisos por WhatsApp.",
      );
    }
    return { channel };
  }

  // Un código nuevo no afecta a los pacientes ya vinculados.
  async rotateLinkCode(userId: string) {
    const psychologist = await this.require(userId);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const updated = await this.prisma.psychologist.update({ where: { id: psychologist.id }, data: { linkCode: generateLinkCode() } });
        return this.formatProfile(updated);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    throw new ConflictException("No pudimos generar un código nuevo. Inténtalo de nuevo.");
  }

  // ─── Inicio ──────────────────────────────────────────

  async dashboard(userId: string) {
    const psychologist = await this.require(userId);
    const zone = psychologist.timezone;
    const dayStart = DateTime.now().setZone(zone).startOf("day");
    const since = DateTime.now().minus({ days: 14 }).toJSDate();

    const [activePatients, today, pendingRequests, upcoming, recentCompletions] = await Promise.all([
      this.prisma.careLink.count({ where: { psychologistId: psychologist.id, status: CareLinkStatus.ACTIVE } }),
      this.prisma.appointment.findMany({
        where: {
          psychologistId: psychologist.id,
          status: { in: ACTIVE_APPOINTMENT },
          startsAt: { gte: dayStart.toJSDate(), lt: dayStart.plus({ days: 1 }).toJSDate() },
        },
        include: { patient: { include: { profile: true } } },
        orderBy: { startsAt: "asc" },
      }),
      this.prisma.appointment.count({
        where: { psychologistId: psychologist.id, status: AppointmentStatus.REQUESTED, startsAt: { gt: new Date() } },
      }),
      this.prisma.appointment.findMany({
        where: { psychologistId: psychologist.id, status: { in: ACTIVE_APPOINTMENT }, startsAt: { gte: dayStart.plus({ days: 1 }).toJSDate() } },
        include: { patient: { include: { profile: true } } },
        orderBy: { startsAt: "asc" },
        take: 5,
      }),
      this.prisma.routineCompletion.findMany({
        where: { routine: { psychologistId: psychologist.id }, completedAt: { gte: since } },
        include: { routine: { include: { patient: { include: { profile: true } } } } },
        orderBy: { completedAt: "desc" },
        take: 30,
      }),
    ]);

    return {
      activePatients,
      pendingRequests,
      today: today.map((a) => this.formatAppointment(a, a.patient?.profile?.displayName)),
      upcoming: upcoming.map((a) => this.formatAppointment(a, a.patient?.profile?.displayName)),
      recentResponses: recentCompletions.slice(0, 8).map((c) => ({
        id: c.id,
        patientId: c.routine.patientId,
        patientName: c.routine.patient.profile?.displayName ?? "Paciente",
        routineTitle: c.routine.title,
        date: c.date.toISOString().slice(0, 10),
        excerpt: (c.textContent ?? c.reflection ?? "").slice(0, 140),
        riskLevel: c.riskLevel,
      })),
      riskAlerts: recentCompletions
        .filter((c) => c.riskLevel && RISKY.includes(c.riskLevel))
        .map((c) => ({
          patientId: c.routine.patientId,
          patientName: c.routine.patient.profile?.displayName ?? "Paciente",
          routineTitle: c.routine.title,
          riskLevel: c.riskLevel,
          completedAt: c.completedAt,
        })),
    };
  }

  // ─── Pacientes ───────────────────────────────────────

  async patients(userId: string) {
    const psychologist = await this.require(userId);
    const links = await this.prisma.careLink.findMany({
      where: { psychologistId: psychologist.id, status: CareLinkStatus.ACTIVE },
      include: { patient: { include: { profile: true, avatar: true } } },
      orderBy: { createdAt: "desc" },
    });
    const weekAgo = DateTime.now().minus({ days: 7 }).toJSDate();

    return Promise.all(
      links.map(async (link) => {
        const [routines, completions, nextAppointment, lastCompletion] = await Promise.all([
          this.prisma.routine.findMany({ where: { patientId: link.patientId, psychologistId: psychologist.id, active: true } }),
          this.prisma.routineCompletion.count({
            where: { routine: { patientId: link.patientId, psychologistId: psychologist.id }, completedAt: { gte: weekAgo } },
          }),
          this.prisma.appointment.findFirst({
            where: { patientId: link.patientId, psychologistId: psychologist.id, status: { in: ACTIVE_APPOINTMENT }, startsAt: { gt: new Date() } },
            orderBy: { startsAt: "asc" },
          }),
          this.prisma.routineCompletion.findFirst({
            where: { routine: { patientId: link.patientId, psychologistId: psychologist.id } },
            orderBy: { completedAt: "desc" },
          }),
        ]);
        const expected = routines.reduce((sum, r) => sum + this.expectedOccurrences(r, link.patient.profile?.timezone ?? psychologist.timezone, 7), 0);

        return {
          patientId: link.patientId,
          displayName: link.patient.profile?.displayName ?? "Paciente",
          avatar: link.patient.avatar && { species: link.patient.avatar.species, name: link.patient.avatar.name },
          linkedAt: link.createdAt,
          activeRoutines: routines.length,
          weekCompletion: { completed: completions, expected },
          lastActivityAt: lastCompletion?.completedAt ?? null,
          nextAppointment: nextAppointment && { id: nextAppointment.id, startsAt: nextAppointment.startsAt, status: nextAppointment.status },
        };
      }),
    );
  }

  async patient(userId: string, patientId: string) {
    const psychologist = await this.require(userId);
    const link = await this.requireLink(psychologist.id, patientId);
    const timezone = link.patient.profile?.timezone ?? psychologist.timezone;
    const since = DateTime.now().minus({ days: 30 }).toJSDate();

    const [routines, completions, dailyChallenges, appointments, contents] = await Promise.all([
      this.prisma.routine.findMany({
        where: { patientId, psychologistId: psychologist.id },
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
        include: { _count: { select: { completions: true } } },
      }),
      this.prisma.routineCompletion.findMany({
        where: { routine: { patientId, psychologistId: psychologist.id }, completedAt: { gte: since } },
        include: { routine: true },
        orderBy: { completedAt: "desc" },
      }),
      // Retos automáticos del catálogo: también forman parte del plan que define el psicólogo.
      this.prisma.dailyChallenge.findMany({
        where: { userId: patientId, status: DailyChallengeStatus.COMPLETED, completedAt: { gte: since } },
        include: { challenge: true, evidence: true },
        orderBy: { completedAt: "desc" },
      }),
      this.prisma.appointment.findMany({
        where: { patientId, psychologistId: psychologist.id },
        orderBy: { startsAt: "desc" },
        take: 20,
      }),
      this.prisma.assignedContent.findMany({
        where: { patientId, psychologistId: psychologist.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const evidenceIds = dailyChallenges.map((d) => d.evidence?.id).filter((id): id is string => Boolean(id));
    const challengeRisks = await this.prisma.riskEvent.findMany({
      where: { source: RiskSource.CHALLENGE, sourceId: { in: evidenceIds } },
      select: { sourceId: true, level: true },
    });
    const riskByEvidence = new Map(challengeRisks.map((r) => [r.sourceId, r.level]));

    const responses = [
      ...completions.map((c) => ({
        id: c.id,
        kind: "routine" as const,
        title: c.routine.title,
        date: c.date.toISOString().slice(0, 10),
        completedAt: c.completedAt,
        textContent: c.textContent,
        reflection: c.reflection,
        riskLevel: c.riskLevel,
      })),
      ...dailyChallenges.map((d) => ({
        id: d.id,
        kind: "daily" as const,
        title: d.challenge.title,
        date: d.date.toISOString().slice(0, 10),
        completedAt: d.completedAt!,
        textContent: d.evidence?.textContent ?? null,
        reflection: d.evidence?.reflection ?? null,
        riskLevel: (d.evidence && riskByEvidence.get(d.evidence.id)) ?? null,
      })),
    ].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

    return {
      patient: {
        id: patientId,
        displayName: link.patient.profile?.displayName ?? "Paciente",
        avatar: link.patient.avatar && { species: link.patient.avatar.species, name: link.patient.avatar.name },
        focusAreas: link.patient.profile?.focusAreas ?? [],
        timezone,
        linkedAt: link.createdAt,
      },
      settings: { autoChallengesPerDay: link.autoChallengesPerDay },
      routines: routines.map((r) => ({
        ...this.formatRoutine(r),
        totalCompletions: r._count.completions,
        week: {
          expected: this.expectedOccurrences(r, timezone, 7),
          completed: completions.filter((c) => c.routineId === r.id && c.completedAt >= DateTime.now().minus({ days: 7 }).toJSDate()).length,
        },
      })),
      responses,
      appointments: appointments.map((a) => this.formatAppointment(a)),
      contents: contents.map((c) => this.formatContent(c)),
    };
  }

  async updatePatientSettings(userId: string, patientId: string, autoChallengesPerDay: number) {
    const psychologist = await this.require(userId);
    const link = await this.requireLink(psychologist.id, patientId);
    await this.prisma.careLink.update({ where: { id: link.id }, data: { autoChallengesPerDay } });
    return { autoChallengesPerDay };
  }

  // ─── Retos asignados ─────────────────────────────────

  async createRoutine(userId: string, patientId: string, dto: CreateRoutineDto) {
    const psychologist = await this.require(userId);
    const link = await this.requireLink(psychologist.id, patientId);
    const timezone = link.patient.profile?.timezone ?? psychologist.timezone;
    const startDate = dto.startDate ?? DateTime.now().setZone(timezone).toISODate()!;
    if (dto.endDate && dto.endDate < startDate) throw new BadRequestException("La fecha de fin es anterior a la de inicio");

    const routine = await this.prisma.routine.create({
      data: {
        psychologistId: psychologist.id,
        patientId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        evidenceType: dto.evidenceType,
        reflectionPrompt: dto.reflectionPrompt?.trim() || null,
        weekdays: [...dto.weekdays].sort(),
        startDate: new Date(`${startDate}T00:00:00Z`),
        endDate: dto.endDate ? new Date(`${dto.endDate}T00:00:00Z`) : null,
        seedsReward: dto.seedsReward ?? 10,
      },
    });
    return this.formatRoutine(routine);
  }

  async updateRoutine(userId: string, routineId: string, dto: UpdateRoutineDto) {
    const psychologist = await this.require(userId);
    const routine = await this.prisma.routine.findFirst({ where: { id: routineId, psychologistId: psychologist.id } });
    if (!routine) throw new NotFoundException("El reto no existe");

    const updated = await this.prisma.routine.update({
      where: { id: routine.id },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        evidenceType: dto.evidenceType,
        reflectionPrompt: dto.reflectionPrompt === undefined ? undefined : dto.reflectionPrompt.trim() || null,
        weekdays: dto.weekdays ? [...dto.weekdays].sort() : undefined,
        endDate: dto.endDate === undefined ? undefined : dto.endDate ? new Date(`${dto.endDate}T00:00:00Z`) : null,
        seedsReward: dto.seedsReward,
        active: dto.active,
      },
    });
    return this.formatRoutine(updated);
  }

  // ─── Contenido asignado ──────────────────────────────

  async createContent(userId: string, patientId: string, dto: CreateContentDto) {
    const psychologist = await this.require(userId);
    await this.requireLink(psychologist.id, patientId);
    if (dto.kind === ContentKind.READING && !dto.body?.trim()) throw new BadRequestException("Escribe el texto de la lectura");
    if (dto.kind === ContentKind.LINK && !dto.url) throw new BadRequestException("Pega el enlace");

    const content = await this.prisma.assignedContent.create({
      data: {
        psychologistId: psychologist.id,
        patientId,
        title: dto.title.trim(),
        kind: dto.kind,
        body: dto.body?.trim() || null,
        url: dto.url ?? null,
      },
    });
    return this.formatContent(content);
  }

  async deleteContent(userId: string, contentId: string) {
    const psychologist = await this.require(userId);
    await this.prisma.assignedContent.deleteMany({ where: { id: contentId, psychologistId: psychologist.id } });
  }

  async catalog(userId: string) {
    await this.require(userId);
    return this.prisma.challenge.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { title: "asc" }],
      select: { id: true, title: true, description: true, category: true, evidenceType: true, reflectionPrompt: true, seedsReward: true },
    });
  }

  // ─── Horario ─────────────────────────────────────────

  async availability(userId: string) {
    const psychologist = await this.require(userId);
    const [rules, blocks] = await Promise.all([
      this.prisma.availabilityRule.findMany({ where: { psychologistId: psychologist.id }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
      this.prisma.availabilityBlock.findMany({ where: { psychologistId: psychologist.id, endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } }),
    ]);
    return {
      timezone: psychologist.timezone,
      sessionMinutes: psychologist.sessionMinutes,
      rules: rules.map((r) => ({ ...r, startLabel: minutesToLabel(r.startMinute), endLabel: minutesToLabel(r.endMinute) })),
      blocks,
    };
  }

  // Reemplaza el horario semanal completo.
  async setRules(userId: string, rules: RuleDto[]) {
    const psychologist = await this.require(userId);
    for (const rule of rules) {
      if (rule.endMinute <= rule.startMinute) throw new BadRequestException("Cada horario debe terminar después de empezar");
    }
    for (let day = 0; day < 7; day++) {
      const sorted = rules.filter((r) => r.weekday === day).sort((a, b) => a.startMinute - b.startMinute);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startMinute < sorted[i - 1].endMinute) throw new BadRequestException("Hay horarios que se enciman el mismo día");
      }
    }
    await this.prisma.$transaction([
      this.prisma.availabilityRule.deleteMany({ where: { psychologistId: psychologist.id } }),
      this.prisma.availabilityRule.createMany({ data: rules.map((r) => ({ ...r, psychologistId: psychologist.id })) }),
    ]);
    return this.availability(userId);
  }

  async addBlock(userId: string, dto: BlockDto) {
    const psychologist = await this.require(userId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException("El bloqueo debe terminar después de empezar");
    await this.prisma.availabilityBlock.create({
      data: { psychologistId: psychologist.id, startsAt, endsAt, reason: dto.reason?.trim() || null },
    });
    return this.availability(userId);
  }

  async removeBlock(userId: string, blockId: string) {
    const psychologist = await this.require(userId);
    await this.prisma.availabilityBlock.deleteMany({ where: { id: blockId, psychologistId: psychologist.id } });
    return this.availability(userId);
  }

  // ─── Citas ───────────────────────────────────────────

  async appointments(userId: string, query: AppointmentsQueryDto) {
    const psychologist = await this.require(userId);
    const list = await this.prisma.appointment.findMany({
      where: {
        psychologistId: psychologist.id,
        status: query.status,
        startsAt: { gte: query.from ? new Date(query.from) : undefined, lt: query.to ? new Date(query.to) : undefined },
      },
      include: { patient: { include: { profile: true } } },
      orderBy: { startsAt: "asc" },
      take: 200,
    });
    return list.map((a) => this.formatAppointment(a, a.patient?.profile?.displayName));
  }

  async actOnAppointment(userId: string, appointmentId: string, dto: AppointmentActionDto) {
    const psychologist = await this.require(userId);
    const appointment = await this.prisma.appointment.findFirst({ where: { id: appointmentId, psychologistId: psychologist.id } });
    if (!appointment) throw new NotFoundException("La cita no existe");

    const now = new Date();
    const data: Prisma.AppointmentUpdateInput = {};
    const meetingUrl = dto.meetingUrl === undefined ? undefined : dto.meetingUrl || null;

    switch (dto.action) {
      case "confirm":
        if (appointment.status !== AppointmentStatus.REQUESTED) throw new ConflictException("Solo se pueden confirmar citas solicitadas");
        data.status = AppointmentStatus.CONFIRMED;
        data.meetingUrl = meetingUrl ?? appointment.meetingUrl ?? psychologist.defaultMeetingUrl;
        break;
      case "cancel":
        if (!ACTIVE_APPOINTMENT.includes(appointment.status)) throw new ConflictException("Esta cita ya no está activa");
        data.status = AppointmentStatus.CANCELLED;
        data.cancelledAt = now;
        if ((dto.cancelReason?.trim().length ?? 0) < 5) {
          throw new BadRequestException("Escribe el motivo de la cancelación (al menos 5 caracteres). Tu paciente lo verá en la app.");
        }
        data.cancelReason = dto.cancelReason!.trim();
        data.cancelledBy = AppointmentCanceller.PSYCHOLOGIST;
        break;
      case "complete":
      case "no_show":
        if (appointment.status !== AppointmentStatus.CONFIRMED) throw new ConflictException("Solo se pueden cerrar citas confirmadas");
        if (appointment.startsAt > now) throw new BadRequestException("La cita todavía no empieza");
        data.status = dto.action === "complete" ? AppointmentStatus.COMPLETED : AppointmentStatus.NO_SHOW;
        break;
      case "update":
        data.meetingUrl = meetingUrl;
        break;
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data,
      include: { patient: { include: { profile: true } } },
    });
    return this.formatAppointment(updated, updated.patient?.profile?.displayName);
  }

  // ─── Auxiliares ──────────────────────────────────────

  private async require(userId: string): Promise<Psychologist> {
    const psychologist = await this.prisma.psychologist.findUnique({ where: { userId } });
    if (!psychologist) throw new ForbiddenException("Esta cuenta no es de psicólogo");
    if (!psychologist.active) throw new ForbiddenException("Tu cuenta está suspendida. Escríbenos para revisarlo.");
    return psychologist;
  }

  private async requireLink(psychologistId: string, patientId: string) {
    const link = await this.prisma.careLink.findFirst({
      where: { psychologistId, patientId, status: CareLinkStatus.ACTIVE },
      include: { patient: { include: { profile: true, avatar: true } } },
    });
    if (!link) throw new NotFoundException("Esta persona no está vinculada contigo");
    return link;
  }

  // Cuántas veces le tocaba el reto en los últimos N días (incluido hoy).
  private expectedOccurrences(routine: Routine, timezone: string, days: number): number {
    if (!routine.active) return 0;
    const today = DateTime.now().setZone(timezone).startOf("day");
    let count = 0;
    for (let i = 0; i < days; i++) {
      const day = today.minus({ days: i });
      const iso = day.toISODate()!;
      if (iso < routine.startDate.toISOString().slice(0, 10)) continue;
      if (routine.endDate && iso > routine.endDate.toISOString().slice(0, 10)) continue;
      if (routine.weekdays.includes(day.weekday % 7)) count++;
    }
    return count;
  }

  private formatProfile(p: Psychologist) {
    return {
      id: p.id,
      fullName: p.fullName,
      licenseNumber: p.licenseNumber,
      specialties: p.specialties,
      bio: p.bio,
      photoUrl: p.photoUrl,
      sessionPriceCents: p.sessionPriceCents,
      currency: p.currency,
      sessionMinutes: p.sessionMinutes,
      timezone: p.timezone,
      defaultMeetingUrl: p.defaultMeetingUrl,
      linkCode: p.linkCode,
      publicBookingEnabled: p.publicBookingEnabled,
      publicSlug: p.publicSlug,
      notifyPhone: p.notifyPhone,
      notifyWhatsappKey: p.notifyWhatsappKey,
      verified: p.verifiedAt !== null,
      active: p.active,
    };
  }

  private formatContent(c: AssignedContent) {
    return { id: c.id, title: c.title, kind: c.kind, body: c.body, url: c.url, createdAt: c.createdAt, completedAt: c.completedAt };
  }

  private formatRoutine(r: Routine) {
    return {
      id: r.id,
      patientId: r.patientId,
      title: r.title,
      description: r.description,
      evidenceType: r.evidenceType,
      reflectionPrompt: r.reflectionPrompt,
      weekdays: r.weekdays,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
      seedsReward: r.seedsReward,
      active: r.active,
      createdAt: r.createdAt,
    };
  }

  private formatAppointment(a: Appointment, patientName?: string) {
    return {
      id: a.id,
      patientId: a.patientId,
      // Las citas de la web no tienen cuenta: se usa el nombre que escribió la persona.
      patientName: patientName ?? a.patientFullName ?? null,
      source: a.source,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      modality: a.modality,
      meetingUrl: a.meetingUrl,
      note: a.notesForPsychologist,
      cancelReason: a.cancelReason,
      cancelledBy: a.cancelledBy,
      // Lo que la persona escribió al agendar.
      patient: a.patientFullName
        ? {
            fullName: a.patientFullName,
            idNumber: a.patientIdNumber,
            birthDate: a.patientBirthDate ? a.patientBirthDate.toISOString().slice(0, 10) : null,
            age: a.patientBirthDate ? ageOn(a.patientBirthDate, a.startsAt) : null,
            email: a.guestEmail,
            phone: a.guestPhone,
          }
        : null,
    };
  }
}

// Años cumplidos en una fecha.
function ageOn(birthDate: Date, on: Date): number {
  const age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < birthDate.getUTCMonth() ||
    (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}
