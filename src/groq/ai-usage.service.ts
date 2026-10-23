import { ForbiddenException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConsentType, Plan } from "@prisma/client";
import { effectivePlan, hasActiveConsent } from "../common/access";
import { localDate, toDateString } from "../common/dates";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";

// Límite diario de mensajes a la IA (chat + reflexiones del diario) según el plan.
// Los mensajes en situación de riesgo nunca se cuentan ni se bloquean.
@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async requireConsent(userId: string) {
    if (!(await hasActiveConsent(this.prisma, userId, ConsentType.AI_PROCESSING))) {
      throw new ForbiddenException({
        code: "AI_CONSENT_REQUIRED",
        message: "Para usar el asistente necesitas aceptar el procesamiento de tus mensajes con IA",
      });
    }
  }

  async status(userId: string) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    const date = localDate(profile.timezone);
    const plan = effectivePlan(profile);
    const limit = plan === Plan.PREMIUM ? config.chat.dailyLimitPremium : config.chat.dailyLimitFree;
    const usage = await this.prisma.chatUsage.findUnique({ where: { userId_date: { userId, date } } });
    const used = usage?.messagesCount ?? 0;

    return {
      date: toDateString(date),
      plan,
      used,
      limit,
      remaining: Math.max(limit - used, 0),
      countryCode: profile.countryCode,
    };
  }

  async ensureAvailable(userId: string) {
    const status = await this.status(userId);
    if (status.remaining <= 0) {
      throw new HttpException(
        {
          code: "AI_DAILY_LIMIT_REACHED",
          message:
            "Por hoy llegaste al límite de mensajes con el asistente. Puedes escribir en tu diario o usar los ejercicios de calma, y mañana seguimos.",
          limit: status.limit,
          plan: status.plan,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return status;
  }

  async increment(userId: string, dateString: string) {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    await this.prisma.chatUsage.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, messagesCount: 1 },
      update: { messagesCount: { increment: 1 } },
    });
  }
}
