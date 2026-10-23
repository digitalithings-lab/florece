import { Injectable, Logger } from "@nestjs/common";
import { RiskLevel, RiskSource } from "@prisma/client";
import { config } from "../config";
import { GroqService } from "../groq/groq.service";
import { PrismaService } from "../prisma/prisma.service";

export interface RiskAssessment {
  level: RiskLevel;
  detector: string;
}

export interface CrisisSupport {
  message: string;
  resources: { name: string; phone: string | null; url: string | null; description: string | null; available24h: boolean }[];
}

// IMPORTANTE: los textos y criterios de este archivo deben ser revisados y
// aprobados por un profesional de salud mental antes de lanzar la app.

const ESCALATE: RiskLevel[] = [RiskLevel.HIGH, RiskLevel.IMMINENT];
const RECORD: RiskLevel[] = [RiskLevel.MODERATE, RiskLevel.HIGH, RiskLevel.IMMINENT];

const CLASSIFIER_PROMPT = `Eres un clasificador de riesgo para una app de bienestar emocional en español.
Analiza el texto de la persona usuaria y evalúa el riesgo de suicidio o autolesión según el CONTEXTO, no por palabras sueltas.
Ejemplos: "Hoy murió mi planta" es NONE. "Ya no tengo pensamientos suicidas" es LOW. "A veces pienso que sería mejor no estar" es MODERATE o HIGH según el resto del texto. "Esta noche voy a tomarme todas las pastillas" es IMMINENT.

Niveles:
- NONE: sin indicios de riesgo.
- LOW: malestar emocional o menciones pasadas o resueltas, sin riesgo actual.
- MODERATE: desesperanza persistente o ideas de no querer vivir, sin plan.
- HIGH: ideación suicida o de autolesión actual, o deseo explícito de morir.
- IMMINENT: plan, método, fecha o intención de actuar pronto.

Responde SOLO con JSON: {"level": "NONE|LOW|MODERATE|HIGH|IMMINENT"}`;

// Respaldo si el clasificador no responde. Como no puede leer el contexto,
// como máximo marca MODERATE: muestra recursos sin interrumpir la conversación.
const FALLBACK_PATTERN =
  /suicid|matarme|quitarme la vida|no quiero vivir|quiero morir|ganas de morir|hacerme dano|autolesi|cortarme|todas las pastillas|acabar con todo|no quiero despertar|desaparecer para siempre/;

const CRISIS_MESSAGE = `Gracias por contármelo. Lo que sientes importa y no tienes que pasar por esto a solas.

Florece no es un servicio de emergencias. Si estás en peligro o crees que podrías hacerte daño, llama ahora al número de emergencias de tu país o acude al servicio de urgencias más cercano.

También puede ayudarte hablar en este momento con alguien de confianza y no quedarte a solas. Abajo tienes líneas de ayuda. Si quieres, puedo acompañarte con un ejercicio para calmarte mientras tanto.`;

const SUPPORT_MESSAGE = `Parece que estás pasando por un momento difícil. Hablar con un profesional puede ayudarte, y si en algún momento sientes que estás en peligro, estas líneas de ayuda están disponibles.`;

export const CALM_EXERCISES = [
  {
    id: "box-breathing",
    title: "Respiración cuadrada",
    durationMinutes: 2,
    steps: [
      "Inhala por la nariz contando hasta 4.",
      "Mantén el aire contando hasta 4.",
      "Exhala por la boca contando hasta 4.",
      "Espera contando hasta 4 y repite cuatro veces.",
    ],
  },
  {
    id: "grounding-54321",
    title: "Orientación con los sentidos (5-4-3-2-1)",
    durationMinutes: 3,
    steps: [
      "Nombra 5 cosas que puedas ver.",
      "Nombra 4 cosas que puedas tocar.",
      "Nombra 3 sonidos que escuches.",
      "Nombra 2 olores que percibas.",
      "Nombra 1 sabor o algo amable que puedas decirte.",
    ],
  },
  {
    id: "trusted-contact",
    title: "Contactar a alguien de confianza",
    durationMinutes: 5,
    steps: [
      "Piensa en una persona con la que te sientas a salvo.",
      "Escríbele o llámale. Puedes decirle simplemente: «¿Puedes hablar un momento? No me siento bien».",
    ],
  },
];

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groq: GroqService,
  ) {}

  shouldEscalate(level: RiskLevel): boolean {
    return ESCALATE.includes(level);
  }

  shouldShowResources(level: RiskLevel): boolean {
    return RECORD.includes(level);
  }

  // Prueba el modelo de seguridad, luego el de respaldo y, si ambos fallan, las palabras clave.
  async assess(text: string): Promise<RiskAssessment> {
    if (this.groq.configured) {
      const models = [...new Set([config.groq.safetyModel, config.groq.safetyFallbackModel])];
      for (const model of models) {
        const assessment = await this.classifyWith(model, text);
        if (assessment) return assessment;
      }
    }
    return this.fallbackAssess(text);
  }

  private async classifyWith(model: string, text: string): Promise<RiskAssessment | null> {
    try {
      const result = await this.groq.complete(
        [
          { role: "system", content: CLASSIFIER_PROMPT },
          { role: "user", content: text.slice(0, 4000) },
        ],
        { model, temperature: 0, maxTokens: 400, json: true },
      );
      const level = (JSON.parse(result.content) as { level?: string }).level;
      if (level && level in RiskLevel) {
        return { level: level as RiskLevel, detector: `groq:${result.model}` };
      }
      this.logger.warn(`Respuesta inesperada del clasificador ${model}: ${result.content.slice(0, 200)}`);
    } catch (err) {
      this.logger.warn(`Clasificador ${model} no disponible: ${(err as Error).message}`);
    }
    return null;
  }

  async record(
    userId: string,
    source: RiskSource,
    sourceId: string | null,
    assessment: RiskAssessment,
    actionTaken: string,
  ): Promise<void> {
    if (!RECORD.includes(assessment.level)) return;
    await this.prisma.riskEvent.create({
      data: {
        userId,
        source,
        sourceId,
        level: assessment.level,
        detector: assessment.detector,
        actionTaken,
        crisisResourcesShown: true,
      },
    });
  }

  async support(level: RiskLevel, countryCode: string | null): Promise<CrisisSupport> {
    return {
      message: this.shouldEscalate(level) ? CRISIS_MESSAGE : SUPPORT_MESSAGE,
      resources: await this.resources(countryCode),
    };
  }

  async resources(countryCode: string | null) {
    if (!countryCode) return [];
    return this.prisma.crisisResource.findMany({
      where: { countryCode, active: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true, phone: true, url: true, description: true, available24h: true },
    });
  }

  private fallbackAssess(text: string): RiskAssessment {
    const normalized = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return {
      level: FALLBACK_PATTERN.test(normalized) ? RiskLevel.MODERATE : RiskLevel.NONE,
      detector: "fallback:keywords",
    };
  }
}
