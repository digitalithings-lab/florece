import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityType, Prisma, SeedReason } from "@prisma/client";
import { decrypt, encrypt } from "../common/crypto";
import { addDays, localDate, toDateString } from "../common/dates";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";
import { REWARDS, UNLOCKS, UnlockRule } from "./activities.constants";
import { LogActivityDto } from "./dto/activities.dto";

type Tx = Prisma.TransactionClient;

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    const today = localDate(profile.timezone);

    const [logs, owned, content, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: { userId, date: { gte: addDays(today, -60) } },
        select: { type: true, date: true },
      }),
      this.prisma.userItem.findMany({ where: { userId }, select: { item: { select: { slug: true } } } }),
      this.prisma.assignedContent.findMany({
        where: { patientId: userId },
        orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
        take: 20,
        include: { psychologist: { select: { fullName: true } } },
      }),
      this.prisma.activityLog.count({ where: { userId } }),
    ]);
    const ownedSlugs = new Set(owned.map((o) => o.item.slug));
    const todayKey = toDateString(today);

    const types = Object.values(ActivityType);
    const todayCounts = Object.fromEntries(types.map((t) => [t, logs.filter((l) => l.type === t && toDateString(l.date) === todayKey).length]));
    const streaks = Object.fromEntries(types.map((t) => [t, streakFrom(logs.filter((l) => l.type === t).map((l) => l.date), today)]));

    const unlockItems = await this.prisma.item.findMany({ where: { slug: { in: UNLOCKS.map((u) => u.itemSlug) } } });

    return {
      waterBalance: profile.waterBalance,
      seedsBalance: profile.seedsBalance,
      today: todayCounts,
      streaks,
      totalActivities: total,
      rewards: REWARDS,
      unlocks: UNLOCKS.map((rule) => {
        const item = unlockItems.find((i) => i.slug === rule.itemSlug);
        const progress = rule.mode === "total" ? total : streaks[rule.type as ActivityType] ?? 0;
        return {
          key: rule.key,
          description: rule.description,
          itemName: item?.name ?? rule.itemSlug,
          emoji: item?.emoji ?? "🎁",
          target: rule.target,
          progress: Math.min(progress, rule.target),
          unlocked: ownedSlugs.has(rule.itemSlug),
        };
      }),
      content: content.map((c) => ({
        id: c.id,
        title: c.title,
        kind: c.kind,
        body: c.body,
        url: c.url,
        psychologistName: c.psychologist.fullName,
        createdAt: c.createdAt,
        completedAt: c.completedAt,
      })),
    };
  }

  async log(userId: string, dto: LogActivityDto) {
    let data: string | null = null;
    if (dto.type === ActivityType.GRATITUDE) {
      const items = (dto.gratitude ?? []).map((g) => g.trim()).filter((g) => g.length >= 2);
      if (items.length === 0) throw new BadRequestException("Escribe al menos una cosa que agradeces hoy");
      data = encrypt(JSON.stringify(items), config.journalKey);
    }
    return this.record(userId, dto.type, { durationSec: dto.durationSec, dataEncrypted: data });
  }

  // Frasco de gratitud: lo que la persona agradeció en días anteriores.
  async gratitudeJar(userId: string) {
    const logs = await this.prisma.activityLog.findMany({
      where: { userId, type: ActivityType.GRATITUDE, dataEncrypted: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    return logs.map((log) => ({
      id: log.id,
      date: toDateString(log.date),
      items: JSON.parse(decrypt(log.dataEncrypted!, config.journalKey)) as string[],
    }));
  }

  async completeContent(userId: string, contentId: string) {
    const content = await this.prisma.assignedContent.findFirst({ where: { id: contentId, patientId: userId } });
    if (!content) throw new NotFoundException("Ese contenido no existe");
    if (content.completedAt) throw new ConflictException("Ya marcaste este contenido como hecho");

    await this.prisma.assignedContent.update({ where: { id: content.id }, data: { completedAt: new Date() } });
    return this.record(userId, ActivityType.CONTENT, { contentId: content.id });
  }

  // Registra la actividad, da la recompensa si corresponde y revisa desbloqueos.
  private async record(
    userId: string,
    type: ActivityType,
    extra: { durationSec?: number; dataEncrypted?: string | null; contentId?: string },
  ) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    const today = localDate(profile.timezone);
    const rule = REWARDS[type];

    const result = await this.prisma.$transaction(async (tx) => {
      // Bloqueo por persona para que el tope diario no se pueda saltar con peticiones simultáneas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`activity:${userId}`}))`;

      const rewardedToday = await tx.activityLog.count({
        where: { userId, type, date: today, OR: [{ waterEarned: { gt: 0 } }, { seedsEarned: { gt: 0 } }] },
      });
      const longEnough = (extra.durationSec ?? 0) >= rule.minSeconds;
      const rewarded = rewardedToday < rule.dailyCap && longEnough;
      const water = rewarded ? rule.water : 0;
      const seeds = rewarded ? rule.seeds : 0;

      const log = await tx.activityLog.create({
        data: {
          userId,
          type,
          date: today,
          durationSec: extra.durationSec ?? null,
          dataEncrypted: extra.dataEncrypted ?? null,
          contentId: extra.contentId ?? null,
          waterEarned: water,
          seedsEarned: seeds,
        },
      });

      const updated = await tx.profile.update({
        where: { userId },
        data: { waterBalance: { increment: water }, seedsBalance: { increment: seeds } },
      });
      if (seeds > 0) {
        await tx.seedTransaction.create({ data: { userId, amount: seeds, reason: SeedReason.ACTIVITY, referenceId: log.id } });
      }

      const unlocked = await this.checkUnlocks(tx, userId, today);
      return {
        waterEarned: water,
        seedsEarned: seeds,
        waterBalance: updated.waterBalance,
        seedsBalance: updated.seedsBalance,
        rewardReason: rewarded ? null : !longEnough ? "too_short" : "daily_cap",
        unlocked,
      };
    });

    return result;
  }

  private async checkUnlocks(tx: Tx, userId: string, today: Date) {
    const owned = new Set(
      (await tx.userItem.findMany({ where: { userId }, select: { item: { select: { slug: true } } } })).map((o) => o.item.slug),
    );
    const pending = UNLOCKS.filter((u) => !owned.has(u.itemSlug));
    if (pending.length === 0) return [];

    const logs = await tx.activityLog.findMany({ where: { userId, date: { gte: addDays(today, -60) } }, select: { type: true, date: true } });
    const total = await tx.activityLog.count({ where: { userId } });

    const reached = pending.filter((rule: UnlockRule) => {
      const progress =
        rule.mode === "total" ? total : streakFrom(logs.filter((l) => l.type === rule.type).map((l) => l.date), today);
      return progress >= rule.target;
    });
    if (reached.length === 0) return [];

    const items = await tx.item.findMany({ where: { slug: { in: reached.map((r) => r.itemSlug) } } });
    for (const item of items) {
      // Los objetos exclusivos llegan ya crecidos.
      await tx.userItem.create({ data: { userId, itemId: item.id, growth: 5 } });
    }
    return items.map((item) => ({ name: item.name, emoji: item.emoji, category: item.category }));
  }
}

// Días seguidos con al menos una actividad, contando desde hoy (o desde ayer si hoy aún no hay).
function streakFrom(dates: Date[], today: Date): number {
  const days = new Set(dates.map((d) => toDateString(d)));
  let cursor = days.has(toDateString(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(toDateString(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
