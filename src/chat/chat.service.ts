import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ChatMessage, ChatMode, ChatRole, RiskSource } from "@prisma/client";
import { config } from "../config";
import { AiUsageService } from "../groq/ai-usage.service";
import { GroqService, LlmMessage } from "../groq/groq.service";
import { PrismaService } from "../prisma/prisma.service";
import { CALM_EXERCISES, SafetyService } from "../safety/safety.service";

// Debe revisarlo un profesional de salud mental antes del lanzamiento.
const SYSTEM_PROMPT = `Eres el acompañante de Florece, una app de bienestar emocional. Hablas en español, de tú, con calidez y sin tecnicismos.

Tu papel: escuchar, validar emociones, ayudar a ordenar lo que la persona siente y proponer estrategias sencillas de autorregulación y autocuidado.

Límites:
- No eres terapeuta ni un servicio de emergencias. No diagnosticas, no hablas de medicación ni de dosis y no das consejos médicos ni legales.
- Si un tema requiere atención profesional (síntomas que duran semanas, trauma, consumo de sustancias, violencia), dilo con cuidado y menciona que puede agendar una cita con un profesional desde la app, sin presionar.
- Si la persona menciona querer morir o hacerse daño, prioriza su seguridad: valida lo que siente, pregúntale si está a salvo ahora y anímala a llamar al número de emergencias de su país o a contactar a alguien de confianza.
- Fomenta su autonomía y sus vínculos con otras personas; no busques que dependa de ti.

Estilo: respuestas breves, de 2 a 5 frases, con como máximo una pregunta por respuesta. Usa lenguaje neutro en cuanto a género (por ejemplo, «cuando lo sientas posible» en lugar de «cuando estés listo o lista»), salvo que la persona indique cómo prefiere que te refieras a ella. Como máximo un emoji por respuesta.`;

const SELF_REGULATION_ADDENDUM = `

Modo autorregulación: guía un ejercicio breve (respiración, orientación con los sentidos o relajación muscular) paso a paso, un paso por mensaje, y al final pregunta cómo se siente.`;

const MODERATE_ADDENDUM = `

La persona muestra señales de desesperanza: valida lo que siente, pregúntale con cuidado si está a salvo e invítala a hablar con un profesional o con alguien de confianza.`;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groq: GroqService,
    private readonly usage: AiUsageService,
    private readonly safety: SafetyService,
  ) {}

  async create(userId: string, mode: ChatMode = ChatMode.SUPPORT) {
    await this.usage.requireConsent(userId);
    const conversation = await this.prisma.chatConversation.create({ data: { userId, mode } });
    return this.formatConversation({ ...conversation, _count: { messages: 0 } });
  }

  async list(userId: string) {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { _count: { select: { messages: true } } },
    });
    return conversations.map((c) => this.formatConversation(c));
  }

  async messages(userId: string, conversationId: string) {
    await this.findOwned(userId, conversationId);
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId, role: { not: ChatRole.SYSTEM } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return messages.map((m) => this.formatMessage(m));
  }

  async end(userId: string, conversationId: string) {
    await this.findOwned(userId, conversationId);
    const conversation = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { endedAt: new Date() },
      include: { _count: { select: { messages: true } } },
    });
    return this.formatConversation(conversation);
  }

  async send(userId: string, conversationId: string, content: string) {
    await this.usage.requireConsent(userId);
    const conversation = await this.findOwned(userId, conversationId);
    if (conversation.endedAt) {
      throw new ConflictException({
        code: "CONVERSATION_ENDED",
        message: "Esta conversación terminó. Puedes iniciar una nueva.",
      });
    }

    const text = content.trim();
    const [assessment, usageStatus] = await Promise.all([this.safety.assess(text), this.usage.status(userId)]);

    // Situación de riesgo: respuesta de apoyo inmediata, sin IA generativa y sin contar contra el límite.
    if (this.safety.shouldEscalate(assessment.level)) {
      const support = await this.safety.support(assessment.level, usageStatus.countryCode);
      const [userMessage, assistantMessage] = await this.prisma.$transaction([
        this.prisma.chatMessage.create({
          data: { conversationId, role: ChatRole.USER, content: text, riskLevel: assessment.level },
        }),
        this.prisma.chatMessage.create({
          data: { conversationId, role: ChatRole.ASSISTANT, content: support.message, model: "safety-template" },
        }),
      ]);
      await this.safety.record(userId, RiskSource.CHAT, userMessage.id, assessment, "crisis_support_shown");
      return {
        userMessage: this.formatMessage(userMessage),
        assistantMessage: this.formatMessage(assistantMessage),
        riskLevel: assessment.level,
        support,
        usage: this.publicUsage(usageStatus),
      };
    }

    const userMessageCount = await this.prisma.chatMessage.count({
      where: { conversationId, role: ChatRole.USER },
    });
    if (userMessageCount >= config.chat.maxUserMessagesPerConversation) {
      await this.prisma.chatConversation.update({ where: { id: conversationId }, data: { endedAt: new Date() } });
      throw new ConflictException({
        code: "CONVERSATION_LIMIT_REACHED",
        message: "Esta conversación ya es larga. Tómate una pausa; si lo necesitas, puedes empezar una nueva más tarde.",
      });
    }

    // Con señales de riesgo, el límite diario no se aplica ni se descuenta.
    const showResources = this.safety.shouldShowResources(assessment.level);
    if (!showResources) {
      await this.usage.ensureAvailable(userId);
    }

    const history = await this.prisma.chatMessage.findMany({
      where: { conversationId, role: { in: [ChatRole.USER, ChatRole.ASSISTANT] } },
      orderBy: { createdAt: "desc" },
      take: config.chat.historyMessages,
    });

    const systemPrompt =
      SYSTEM_PROMPT +
      (conversation.mode === ChatMode.SELF_REGULATION ? SELF_REGULATION_ADDENDUM : "") +
      (showResources ? MODERATE_ADDENDUM : "");

    const llmMessages: LlmMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.reverse().map((m) => ({
        role: m.role === ChatRole.USER ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
      { role: "user", content: text },
    ];

    let result;
    try {
      result = await this.groq.complete(llmMessages, { temperature: 0.7, maxTokens: 1000 });
    } catch (err) {
      // Aunque la IA falle, la persona no se queda sin opciones: ejercicios de calma y líneas de ayuda.
      if (!(err instanceof ServiceUnavailableException)) throw err;
      throw new ServiceUnavailableException({
        code: "AI_UNAVAILABLE",
        message: "El asistente no está disponible en este momento. Mientras tanto, estos recursos pueden ayudarte.",
        calmExercises: CALM_EXERCISES,
        support: await this.safety.support(assessment.level, usageStatus.countryCode),
      });
    }

    const [userMessage, assistantMessage] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { conversationId, role: ChatRole.USER, content: text, riskLevel: assessment.level },
      }),
      this.prisma.chatMessage.create({
        data: {
          conversationId,
          role: ChatRole.ASSISTANT,
          content: result.content,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        },
      }),
      ...(conversation.title
        ? []
        : [this.prisma.chatConversation.update({ where: { id: conversationId }, data: { title: text.slice(0, 60) } })]),
    ]);
    let support = null;
    let usageAfter = usageStatus;
    if (showResources) {
      await this.safety.record(userId, RiskSource.CHAT, userMessage.id, assessment, "resources_shown");
      support = await this.safety.support(assessment.level, usageStatus.countryCode);
    } else {
      await this.usage.increment(userId, usageStatus.date);
      usageAfter = { ...usageStatus, used: usageStatus.used + 1, remaining: usageStatus.remaining - 1 };
    }

    return {
      userMessage: this.formatMessage(userMessage as ChatMessage),
      assistantMessage: this.formatMessage(assistantMessage as ChatMessage),
      riskLevel: assessment.level,
      support,
      usage: this.publicUsage(usageAfter),
    };
  }

  async usageStatus(userId: string) {
    return this.publicUsage(await this.usage.status(userId));
  }

  private async findOwned(userId: string, conversationId: string) {
    const conversation = await this.prisma.chatConversation.findFirst({ where: { id: conversationId, userId } });
    if (!conversation) {
      throw new NotFoundException("La conversación no existe");
    }
    return conversation;
  }

  private publicUsage(status: { date: string; plan: string; used: number; limit: number; remaining: number }) {
    return {
      date: status.date,
      plan: status.plan,
      used: status.used,
      limit: status.limit,
      remaining: Math.max(status.remaining, 0),
    };
  }

  private formatConversation(c: {
    id: string;
    mode: ChatMode;
    title: string | null;
    startedAt: Date;
    endedAt: Date | null;
    _count: { messages: number };
  }) {
    return {
      id: c.id,
      mode: c.mode,
      title: c.title,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      messageCount: c._count.messages,
    };
  }

  private formatMessage(m: ChatMessage) {
    return { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt };
  }
}
