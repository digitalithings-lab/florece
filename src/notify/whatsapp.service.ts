import { Injectable, Logger } from "@nestjs/common";

/**
 * Avisos por WhatsApp al propio psicólogo. Según la clave:
 * - Solo números → CallMeBot (gratis, uso personal): https://www.callmebot.com/blog/free-api-whatsapp-messages/
 * - Letras y números → TextMeBot (de pago): https://textmebot.com
 * Nunca hace fallar la operación que lo llama.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  async send(phone: string, apiKey: string, text: string): Promise<boolean> {
    const textMeBot = !/^\d+$/.test(apiKey);
    const url = new URL(textMeBot ? "https://api.textmebot.com/send.php" : "https://api.callmebot.com/whatsapp.php");
    url.searchParams.set(textMeBot ? "recipient" : "phone", phone);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("text", text.slice(0, 1500));
    const provider = textMeBot ? "TextMeBot" : "CallMeBot";
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const body = await response.text();
      // Ambos responden texto o HTML; los fallos traen «error», «invalid» o, en TextMeBot sin WhatsApp vinculado, «don't have».
      if (!response.ok || /error|invalid|don'?t have|add a phone/i.test(body)) {
        this.logger.error(`${provider} respondió ${response.status}: ${body.replace(/<[^>]+>/g, " ").slice(0, 200)}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`No se pudo enviar el WhatsApp (${provider}): ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }
}
