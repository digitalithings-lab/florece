import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { config } from "../config";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
}

export interface LlmResult {
  content: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

interface GroqResponse {
  model: string;
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

// Cliente mínimo para la API de Groq (compatible con el formato de OpenAI).
// La clave solo vive en el backend; la app móvil nunca llama a Groq directamente.
@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);

  get configured(): boolean {
    return config.groq.apiKey.length > 0;
  }

  async complete(messages: LlmMessage[], options: LlmOptions = {}): Promise<LlmResult> {
    if (!this.configured) {
      throw new ServiceUnavailableException("El asistente no está disponible en este momento");
    }

    const model = options.model ?? config.groq.model;
    // Los modelos gpt-oss razonan antes de responder: max_tokens incluye ese razonamiento.
    const isReasoningModel = model.startsWith("openai/gpt-oss");

    let response: Response;
    try {
      response = await fetch(`${config.groq.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.groq.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1000,
          ...(isReasoningModel ? { reasoning_effort: options.reasoningEffort ?? "low" } : {}),
          ...(options.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(config.groq.timeoutMs),
      });
    } catch (err) {
      this.logger.error(`No se pudo contactar a Groq: ${(err as Error).message}`);
      throw new ServiceUnavailableException("El asistente no está disponible en este momento");
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.logger.error(`Groq respondió ${response.status}: ${body.slice(0, 500)}`);
      throw new ServiceUnavailableException("El asistente no está disponible en este momento");
    }

    const data = (await response.json()) as GroqResponse;
    const content = data.choices[0]?.message.content?.trim();
    if (!content) {
      throw new ServiceUnavailableException("El asistente no está disponible en este momento");
    }

    return {
      content,
      model: data.model,
      tokensIn: data.usage?.prompt_tokens ?? null,
      tokensOut: data.usage?.completion_tokens ?? null,
    };
  }
}
