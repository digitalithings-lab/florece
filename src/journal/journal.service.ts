import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { JournalEntry, MoodLog, RiskSource } from "@prisma/client";
import { EmotionsService } from "../emotions/emotions.service";
import { decrypt, encrypt } from "../common/crypto";
import { addDays, dateFromString, localDate, toDateString } from "../common/dates";
import { config } from "../config";
import { AiUsageService } from "../groq/ai-usage.service";
import { GroqService } from "../groq/groq.service";
import { PrismaService } from "../prisma/prisma.service";
import { SafetyService } from "../safety/safety.service";
import {
  CreateJournalEntryDto,
  CreateMoodDto,
  ListJournalQueryDto,
  UpdateJournalEntryDto,
} from "./dto/journal.dto";

const EXCERPT_LENGTH = 140;
const PROMPTS_PER_REQUEST = 3;

// Debe revisarlo un profesional de salud mental antes del lanzamiento.
const REFLECTION_PROMPT = `Eres el acompañante de escritura de Florece, una app de bienestar emocional.
Lee la entrada del diario y responde con una reflexión breve (máximo 80 palabras), cálida, en español y hablando de tú.

Según lo que exprese la persona:
- Gratitud o alegría: reconócelo de forma específica, sin felicitaciones exageradas.
- Tristeza o frustración: valida la emoción y, si encaja, sugiere una acción de autocuidado opcional.
- Rutina cotidiana: haz una pregunta reflexiva sencilla, sin convertir un día normal en un problema.
- Desesperanza persistente: invita con cuidado a buscar apoyo profesional.

No diagnostiques, no des indicaciones médicas ni sobre medicación, no juzgues y no inventes detalles que no estén en el texto. Usa lenguaje neutro en cuanto a género.`;

const MODERATE_ADDENDUM =
  "\n\nLa persona muestra señales de desesperanza: valida lo que siente e incluye una invitación cuidadosa a hablar con un profesional o con alguien de confianza.";

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groq: GroqService,
    private readonly usage: AiUsageService,
    private readonly safety: SafetyService,
    private readonly emotions: EmotionsService,
  ) {}

  async prompts(userId: string) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    const prompts = await this.prisma.journalPrompt.findMany({
      where: {
        active: true,
        OR: [{ focusArea: null }, { focusArea: { in: profile.focusAreas } }],
      },
      select: { id: true, text: true, focusArea: true },
    });
    return shuffle(prompts).slice(0, PROMPTS_PER_REQUEST);
  }

  async create(userId: string, dto: CreateJournalEntryDto) {
    if (dto.promptId) {
      const prompt = await this.prisma.journalPrompt.findUnique({ where: { id: dto.promptId } });
      if (!prompt) throw new BadRequestException("La pregunta guiada no existe");
    }
    const entry = await this.prisma.journalEntry.create({
      data: {
        userId,
        promptId: dto.promptId,
        title: dto.title?.trim() || null,
        contentEncrypted: encrypt(dto.content, config.journalKey),
        theme: dto.theme,
        pageColor: dto.pageColor,
      },
      include: { prompt: true },
    });
    return this.formatFull(entry);
  }

  async list(userId: string, query: ListJournalQueryDto) {
    const limit = query.limit ?? 20;
    const entries = await this.prisma.journalEntry.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { prompt: true },
    });

    const page = entries.slice(0, limit);
    return {
      items: page.map((entry) => {
        const content = decrypt(entry.contentEncrypted, config.journalKey);
        return {
          id: entry.id,
          title: entry.title,
          excerpt: content.length > EXCERPT_LENGTH ? `${content.slice(0, EXCERPT_LENGTH)}…` : content,
          theme: entry.theme,
          pageColor: entry.pageColor,
          prompt: entry.prompt?.text ?? null,
          hasReflection: entry.aiReflection !== null,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        };
      }),
      nextCursor: entries.length > limit ? page[page.length - 1].id : null,
    };
  }

  async get(userId: string, id: string) {
    return this.formatFull(await this.findOwned(userId, id));
  }

  async update(userId: string, id: string, dto: UpdateJournalEntryDto) {
    await this.findOwned(userId, id);
    const entry = await this.prisma.journalEntry.update({
      where: { id },
      data: {
        title: dto.title === undefined ? undefined : dto.title.trim() || null,
        theme: dto.theme,
        pageColor: dto.pageColor,
        // Si cambia el texto, la reflexión anterior deja de corresponder.
        ...(dto.content !== undefined
          ? { contentEncrypted: encrypt(dto.content, config.journalKey), aiReflection: null }
          : {}),
      },
      include: { prompt: true },
    });
    return this.formatFull(entry);
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.journalEntry.delete({ where: { id } });
  }

  async reflect(userId: string, id: string) {
    await this.usage.requireConsent(userId);
    const entry = await this.findOwned(userId, id);
    const content = decrypt(entry.contentEncrypted, config.journalKey);

    const assessment = await this.safety.assess(content);
    const usageStatus = await this.usage.status(userId);

    if (this.safety.shouldEscalate(assessment.level)) {
      await this.safety.record(userId, RiskSource.JOURNAL, entry.id, assessment, "crisis_support_shown");
      return {
        reflection: null,
        riskLevel: assessment.level,
        support: await this.safety.support(assessment.level, usageStatus.countryCode),
      };
    }

    // Con señales de riesgo, el límite diario no se aplica ni se descuenta.
    const showResources = this.safety.shouldShowResources(assessment.level);
    if (!showResources) {
      await this.usage.ensureAvailable(userId);
    }
    const result = await this.groq.complete(
      [
        { role: "system", content: REFLECTION_PROMPT + (showResources ? MODERATE_ADDENDUM : "") },
        { role: "user", content: content.slice(0, 8000) },
      ],
      { temperature: 0.6, maxTokens: 800 },
    );

    await this.prisma.journalEntry.update({
      where: { id },
      data: { aiReflection: encrypt(result.content, config.journalKey) },
    });
    let support = null;
    if (showResources) {
      await this.safety.record(userId, RiskSource.JOURNAL, entry.id, assessment, "resources_shown");
      support = await this.safety.support(assessment.level, usageStatus.countryCode);
    } else {
      await this.usage.increment(userId, usageStatus.date);
    }

    return { reflection: result.content, riskLevel: assessment.level, support };
  }

  async createMood(userId: string, dto: CreateMoodDto) {
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });
    const today = localDate(profile.timezone);
    const date = dto.date ? dateFromString(dto.date) : today;
    if (date > today) {
      throw new BadRequestException("No puedes registrar emociones de días futuros");
    }

    // Solo se aceptan emociones de la lista que esta persona tiene disponible.
    const options = await this.emotions.optionsForUser(userId);
    const option = dto.emotionOptionId
      ? options.find((o) => o.id === dto.emotionOptionId)
      : dto.emotion // apps anteriores enviaban el nombre fijo de la emoción
        ? options.find((o) => o.slug === dto.emotion!.toLowerCase())
        : undefined;
    if (!option) throw new BadRequestException("Elige una de las emociones de la lista");

    const log = await this.prisma.moodLog.create({
      data: {
        userId,
        date,
        emotionOptionId: option.id,
        emotionLabel: option.label,
        emotionEmoji: option.emoji,
        emotionColor: option.color,
        intensity: dto.intensity,
        note: dto.note?.trim() || null,
      },
    });
    return this.formatMood(log);
  }

  async moodOptions(userId: string) {
    return (await this.emotions.optionsForUser(userId)).map((o) => ({ id: o.id, label: o.label, emoji: o.emoji, color: o.color }));
  }

  async moodsForMonth(userId: string, month: string) {
    const from = dateFromString(`${month}-01`);
    const to = addDays(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)), -1);

    const logs = await this.prisma.moodLog.findMany({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    // Resumen por emoción (agrupado por nombre, emoji y color tal como se registraron).
    const byEmotion = new Map<string, { label: string; emoji: string; color: string; count: number }>();
    for (const log of logs) {
      const key = `${log.emotionLabel}|${log.emotionEmoji}|${log.emotionColor}`;
      const entry = byEmotion.get(key) ?? { label: log.emotionLabel, emoji: log.emotionEmoji, color: log.emotionColor, count: 0 };
      entry.count++;
      byEmotion.set(key, entry);
    }

    return {
      month,
      logs: logs.map((log) => this.formatMood(log)),
      summary: {
        total: logs.length,
        daysLogged: new Set(logs.map((log) => toDateString(log.date))).size,
        byEmotion: [...byEmotion.values()].sort((a, b) => b.count - a.count),
      },
    };
  }

  private async findOwned(userId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id, userId }, include: { prompt: true } });
    if (!entry) {
      throw new NotFoundException("La entrada no existe");
    }
    return entry;
  }

  private formatFull(entry: JournalEntry & { prompt: { text: string } | null }) {
    return {
      id: entry.id,
      title: entry.title,
      content: decrypt(entry.contentEncrypted, config.journalKey),
      theme: entry.theme,
      pageColor: entry.pageColor,
      prompt: entry.prompt?.text ?? null,
      reflection: entry.aiReflection ? decrypt(entry.aiReflection, config.journalKey) : null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  private formatMood(log: MoodLog) {
    return {
      id: log.id,
      date: toDateString(log.date),
      emotion: { id: log.emotionOptionId, label: log.emotionLabel, emoji: log.emotionEmoji, color: log.emotionColor },
      intensity: log.intensity,
      note: log.note,
      createdAt: log.createdAt,
    };
  }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
