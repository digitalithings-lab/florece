import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
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

    let items = await this.findForDate(userId, date);
    if (items.length === 0) {
      await this.assign(userId, profile.focusAreas, date);
      items = await this.findForDate(userId, date);
    }

    return {
      date: toDateString(date),
      completed: items.filter((i) => i.status === DailyChallengeStatus.COMPLETED).length,
      total: items.length,
      seedsBalance: profile.seedsBalance,
      items: items.map((i) => this.format(i)),
    };
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
  private async assign(userId: string, focusAreas: FocusArea[], date: Date) {
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

      const picks = DAILY_CATEGORIES.map((category) =>
        this.pick(
          catalog.filter((c) => c.category === category),
          recentIds,
          focusAreas,
        ),
      ).filter((c): c is Challenge => c !== null);

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
  private validateEvidence(challenge: Challenge, dto: CompleteChallengeDto) {
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
