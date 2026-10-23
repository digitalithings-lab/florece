// Configuración leída de variables de entorno. Falla al arrancar si falta algo
// imprescindible, para no descubrirlo a mitad de una petición.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`La variable de entorno ${name} debe ser un número`);
  }
  return value;
}

function journalKey(): Buffer {
  const key = Buffer.from(required("JOURNAL_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) {
    throw new Error("JOURNAL_ENCRYPTION_KEY debe ser de 32 bytes codificados en base64");
  }
  return key;
}

export const config = {
  port: int("PORT", 3000),
  jwtSecret: required("JWT_SECRET"),
  accessTokenTtlSeconds: int("ACCESS_TOKEN_TTL_SECONDS", 15 * 60),
  refreshTokenTtlDays: int("REFRESH_TOKEN_TTL_DAYS", 30),
  journalKey: journalKey(),
  consentVersion: process.env.CONSENT_VERSION ?? "2026-10",
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? "",
    baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
    model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
    // Modelo de clasificación de seguridad: evalúa el texto contra la política de riesgo.
    safetyModel: process.env.GROQ_SAFETY_MODEL ?? "openai/gpt-oss-safeguard-20b",
    // Se usa si el modelo de seguridad falla o llega a su límite de peticiones por minuto.
    safetyFallbackModel: process.env.GROQ_SAFETY_FALLBACK_MODEL ?? "openai/gpt-oss-20b",
    timeoutMs: int("GROQ_TIMEOUT_MS", 30_000),
  },
  chat: {
    dailyLimitFree: int("CHAT_LIMIT_FREE", 10),
    dailyLimitPremium: int("CHAT_LIMIT_PREMIUM", 30),
    maxUserMessagesPerConversation: int("CHAT_MAX_MESSAGES_PER_CONVERSATION", 40),
    historyMessages: int("CHAT_HISTORY_MESSAGES", 20),
  },
};
