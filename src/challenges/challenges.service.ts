import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CareLinkStatus,
  Challenge,
  ChallengeCategory,
  DailyChallengeStatus,
  EvidenceType,
  FocusArea,
  Prisma,
  RiskSource,
  SeedReason,
} from "@prisma/client";
import { addDays, localDate, toDateString } from "../common/dates";
import { PrismaService } from "../prisma/prisma.service";
import { SafetyService } from "../safety/safety.service";
import { CompleteChallengeDto } from "./dto/challenges.dto";

// Cada día: una actividad de autoconocimiento, una de habilidades emocionales y una de autocuidado.
const DAILY_CATEGORIES: ChallengeCategory[] = [
  ChallengeCategory.SELF_KNOWLEDGE,
  ChallengeCategory.EMOTIONAL_SKILLS,
  ChallengeCategory.SELF_CARE,
];
const AVOID_REPEAT_DAYS = 7;
// Sin psicólogo vinculado, cada persona recibe 3 retos automáticos al día.
const DEFAULT_AUTO_CHALLENGES = 3;

type DailyWithRelations = Prisma.DailyChallengeGetPayload<{ include: { challenge: true; evidence: true } }>;

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
  ) {}

  async today(userId: string) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    const date = localDate(profile.timezone);

    // Con psicólogo vinculado, él decide cuántos retos automáticos recibe la persona (0 a 6).
    const link = await this.prisma.careLink.findFirst({
      where: { patientId: userId, status: CareLinkStatus.ACTIVE },
      include: { psychologist: true },
    });
    const autoCount = link ? link.autoChallengesPerDay : DEFAULT_AUTO_CHALLENGES;

    let items = await this.findForDate(userId, date);
    if (items.length === 0 && autoCount > 0) {
      await this.assign(userId, profile.focusAreas, date, autoCount);
      items = await this.findForDate(userId, date);
    }

    const routines = await this.routinesForDate(userId, date);
    const routinesDone = routines.filter((r) => r.completions.length > 0).length;

    return {
      date: toDateString(date),
      completed: items.filter((i) => i.status === DailyChallengeStatus.COMPLETED).length + routinesDone,
      total: items.length + routines.length,
      seedsBalance: profile.seedsBalance,
      psychologistName: link?.psychologist.fullName ?? null,
      routines: routines.map((r) => this.formatRoutine(r)),
      items: items.map((i) => this.format(i)),
    };
  }

  // Reto asignado por el psicólogo para hoy.
  async completeRoutine(userId: string, routineId: string, dto: CompleteChallengeDto) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    const date = localDate(profile.timezone);
    const routine = (await this.routinesForDate(userId, date)).find((r) => r.id === routineId);
    if (!routine) throw new NotFoundException("Este reto no te toca hoy");
    if (routine.completions.length > 0) throw new ConflictException("Ya completaste este reto hoy");

    this.validateEvidence(routine, dto);

    const [completion, updatedProfile] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.routineCompletion.create({
        data: {
          routineId,
          date,
          textContent: dto.textContent?.trim() || null,
          reflection: dto.reflection?.trim() || null,
        },
      });
      await tx.seedTransaction.create({
        data: { userId, amount: routine.seedsReward, reason: SeedReason.CHALLENGE, referenceId: created.id },
      });
      const updated = await tx.profile.update({ where: { userId }, data: { seedsBalance: { increment: routine.seedsReward } } });
      return [created, updated] as const;
    }).catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Ya completaste este reto hoy");
      }
      throw err;
    });

    // El nivel de riesgo queda guardado con la respuesta para que el psicólogo lo vea.
    const text = [dto.textContent, dto.reflection].filter((t) => t?.trim()).join("\n");
    let support = null;
    if (text) {
      const assessment = await this.safety.assess(text);
      await this.prisma.routineCompletion.update({ where: { id: completion.id }, data: { riskLevel: assessment.level } });
      if (this.safety.shouldShowResources(assessment.level)) {
        await this.safety.record(userId, RiskSource.ROUTINE, completion.id, assessment, "resources_shown");
        support = { riskLevel: assessment.level, ...(await this.safety.support(assessment.level, profile.countryCode)) };
      }
    }

    return { seedsEarned: routine.seedsReward, seedsBalance: updatedProfile.seedsBalance, support };
  }

  async complete(userId: string, dailyChallengeId: string, dto: CompleteChallengeDto) {
    const daily = await this.findOwnedForToday(userId, dailyChallengeId);
    this.validateEvidence(daily.challenge, dto);

    const reward = daily.challenge.seedsReward;
    const [, evidence, , profile] = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dailyChallenge.updateMany({
        where: { id: daily.id, status: DailyChallengeStatus.PENDING },
        data: { status: DailyChallengeStatus.COMPLETED, completedAt: new Date(), seedsAwarded: reward },
      });
      if (updated.count === 0) {
        throw new ConflictException("Este reto ya fue completado o saltado");
      }
      return Promise.all([
        Promise.resolve(updated),
        tx.challengeEvidence.create({
          data: {
            dailyChallengeId: daily.id,
            type: daily.challenge.evidenceType,
            textContent: dto.textContent?.trim() || null,
            mediaKey: dto.mediaKey ?? null,
            mediaDurationSec: dto.mediaDurationSec ?? null,
            reflection: dto.reflection?.trim() || null,
          },
        }),
        tx.seedTransaction.create({
          data: { userId, amount: reward, reason: SeedReason.CHALLENGE, referenceId: daily.id },
        }),
        tx.profile.update({ where: { userId }, data: { seedsBalance: { increment: reward } } }),
      ]);
    });

    const support = await this.checkRisk(userId, evidence.id, [dto.textContent, dto.reflection], profile.countryCode);
    const refreshed = await this.prisma.dailyChallenge.findUniqueOrThrow({
      where: { id: daily.id },
      include: { challenge: true, evidence: true },
    });

    return {
      item: this.format(refreshed),
      seedsEarned: reward,
      seedsBalance: profile.seedsBalance,
      support,
    };
  }

  async skip(userId: string, dailyChallengeId: string) {
    const daily = await this.findOwnedForToday(userId, dailyChallengeId);
    const updated = await this.prisma.dailyChallenge.updateMany({
      where: { id: daily.id, status: DailyChallengeStatus.PENDING },
      data: { status: DailyChallengeStatus.SKIPPED },
    });
    if (updated.count === 0) {
      throw new ConflictException("Este reto ya fue completado o saltado");
    }
    return this.today(userId);
  }

  async history(userId: string, days: number) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    const today = localDate(profile.timezone);
    const from = addDays(today, -(days - 1));

    const rows = await this.prisma.dailyChallenge.findMany({
      where: { userId, date: { gte: from, lte: today } },
      select: { date: true, status: true, seedsAwarded: true },
      orderBy: { date: "asc" },
    });

    const byDate = new Map<string, { date: string; completed: number; total: number; seeds: number }>();
    for (const row of rows) {
      const key = toDateString(row.date);
      const day = byDate.get(key) ?? { date: key, completed: 0, total: 0, seeds: 0 };
      day.total++;
      if (row.status === DailyChallengeStatus.COMPLETED) {
        day.completed++;
        day.seeds += row.seedsAwarded;
      }
      byDate.set(key, day);
    }

    const daysList = [...byDate.values()];
    return {
      from: toDateString(from),
      to: toDateString(today),
      totalCompleted: daysList.reduce((sum, d) => sum + d.completed, 0),
      days: daysList,
    };
  }

  private findForDate(userId: string, date: Date) {
    return this.prisma.dailyChallenge.findMany({
      where: { userId, date },
      include: { challenge: true, evidence: true },
      orderBy: { challenge: { category: "asc" } },
    });
  }

  // Asigna los retos del día. El bloqueo evita que dos peticiones simultáneas
  // asignen dos juegos distintos de retos para el mismo día.
  private async assign(userId: string, focusAreas: FocusArea[], date: Date, count: number) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`daily:${userId}:${toDateString(date)}`}))`;

      const already = await tx.dailyChallenge.count({ where: { userId, date } });
      if (already > 0) return;

      const [catalog, recent] = await Promise.all([
        tx.challenge.findMany({ where: { active: true } }),
        tx.dailyChallenge.findMany({
          where: { userId, date: { gte: addDays(date, -AVOID_REPEAT_DAYS), lt: date } },
          select: { challengeId: true },
        }),
      ]);
      const recentIds = new Set(recent.map((r) => r.challengeId));

      // Se reparten las categorías en orden (autoconocimiento, habilidades, autocuidado, …)
      // sin repetir un mismo reto en el día.
      const picks: Challenge[] = [];
      for (let i = 0; i < count; i++) {
        const category = DAILY_CATEGORIES[i % DAILY_CATEGORIES.length];
        const taken = new Set(picks.map((p) => p.id));
        const candidates = catalog.filter((c) => !taken.has(c.id));
        const choice =
          this.pick(candidates.filter((c) => c.category === category), recentIds, focusAreas) ??
          this.pick(candidates, recentIds, focusAreas);
        if (choice) picks.push(choice);
      }

      await tx.dailyChallenge.createMany({
        data: picks.map((c) => ({ userId, challengeId: c.id, date })),
        skipDuplicates: true,
      });
    });
  }

  private pick(candidates: Challenge[], recentIds: Set<string>, focusAreas: FocusArea[]): Challenge | null {
    if (candidates.length === 0) return null;
    const fresh = candidates.filter((c) => !recentIds.has(c.id));
    const pool = fresh.length > 0 ? fresh : candidates;
    const matching = pool.filter((c) => c.focusAreas.some((area) => focusAreas.includes(area)));
    const finalPool = matching.length > 0 ? matching : pool;
    return finalPool[Math.floor(Math.random() * finalPool.length)];
  }

  private async findOwnedForToday(userId: string, dailyChallengeId: string) {
    const daily = await this.prisma.dailyChallenge.findFirst({
      where: { id: dailyChallengeId, userId },
      include: { challenge: true, user: { include: { profile: true } } },
    });
    if (!daily) {
      throw new NotFoundException("El reto no existe");
    }
    const timezone = daily.user.profile?.timezone ?? "UTC";
    if (toDateString(daily.date) !== toDateString(localDate(timezone))) {
      throw new BadRequestException("Solo puedes completar o saltar los retos de hoy");
    }
    if (daily.status !== DailyChallengeStatus.PENDING) {
      throw new ConflictException("Este reto ya fue completado o saltado");
    }
    return daily;
  }

  // No basta con presionar «Completado»: cada tipo de reto pide una evidencia mínima.
  // Retos del psicólogo que le tocan a la persona en esa fecha (según el día de la semana).
  private async routinesForDate(userId: string, date: Date) {
    const routines = await this.prisma.routine.findMany({
      where: {
        patientId: userId,
        active: true,
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      include: { completions: { where: { date } }, psychologist: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return routines.filter((r) => r.weekdays.includes(date.getUTCDay()));
  }

  private formatRoutine(r: Awaited<ReturnType<ChallengesService["routinesForDate"]>>[number]) {
    const completion = r.completions[0] ?? null;
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      evidenceType: r.evidenceType,
      reflectionPrompt: r.reflectionPrompt,
      seedsReward: r.seedsReward,
      psychologistName: r.psychologist.fullName,
      status: completion ? DailyChallengeStatus.COMPLETED : DailyChallengeStatus.PENDING,
      completedAt: completion?.completedAt ?? null,
    };
  }

  private validateEvidence(challenge: Pick<Challenge, "evidenceType">, dto: CompleteChallengeDto) {
    const hasText = (value?: string) => (value?.trim().length ?? 0) >= 3;

    switch (challenge.evidenceType) {
      case EvidenceType.TEXT:
        if (!hasText(dto.textContent)) {
          throw new BadRequestException("Escribe una respuesta breve para completar este reto");
        }
        break;
      case EvidenceType.AUDIO:
        if (!dto.mediaKey) {
          throw new BadRequestException("Graba una nota de voz para completar este reto");
        }
        break;
      case EvidenceType.PHOTO:
        // La foto es opcional; la reflexión no.
        if (!hasText(dto.reflection)) {
          throw new BadRequestException("Cuéntanos brevemente cómo te fue para completar este reto");
        }
        break;
      case EvidenceType.INTERACTIVE:
        if (!hasText(dto.reflection)) {
          throw new BadRequestException("Escribe qué observaste en ti al terminar el ejercicio");
        }
        break;
    }
  }

  private async checkRisk(
    userId: string,
    evidenceId: string,
    texts: (string | undefined)[],
    countryCode: string | null,
  ) {
    const text = texts.filter((t) => t?.trim()).join("\n");
    if (!text) return null;

    const assessment = await this.safety.assess(text);
    if (!this.safety.shouldShowResources(assessment.level)) return null;

    await this.safety.record(userId, RiskSource.CHALLENGE, evidenceId, assessment, "resources_shown");
    return { riskLevel: assessment.level, ...(await this.safety.support(assessment.level, countryCode)) };
  }

  private format(item: DailyWithRelations) {
    const { challenge, evidence } = item;
    return {
      id: item.id,
      date: toDateString(item.date),
      status: item.status,
      completedAt: item.completedAt,
      seedsAwarded: item.seedsAwarded,
      challenge: {
        slug: challenge.slug,
        title: challenge.title,
        description: challenge.description,
        category: challenge.category,
        evidenceType: challenge.evidenceType,
        reflectionPrompt: challenge.reflectionPrompt,
        seedsReward: challenge.seedsReward,
        durationMinutes: challenge.durationMinutes,
      },
      evidence: evidence && {
        type: evidence.type,
        textContent: evidence.textContent,
        mediaKey: evidence.mediaKey,
        reflection: evidence.reflection,
        createdAt: evidence.createdAt,
      },
    };
  }
}
