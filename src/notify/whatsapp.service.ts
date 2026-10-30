import { Injectable, Logger } from "@nestjs/common";

/**
 * Avisos a tu propio WhatsApp con CallMeBot (gratis, uso personal):
 * https://www.callmebot.com/blog/free-api-whatsapp-messages/
 * Cada psicólogo activa su clave enviando «I allow callmebot to send me messages» al +34 644 33 66 63.
 * Nunca hace fallar la operación que lo llama.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  async send(phone: string, apiKey: string, text: string): Promise<boolean> {
    const url = new URL("https://api.callmebot.com/whatsapp.php");
    url.searchParams.set("phone", phone);
    url.searchParams.set("text", text.slice(0, 1500));
    url.searchParams.set("apikey", apiKey);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const body = await response.text();
      // CallMeBot responde HTML; los fallos traen «ERROR» o «APIKey is invalid» en el texto.
      if (!response.ok || /error|invalid/i.test(body)) {
        this.logger.error(`CallMeBot respondió ${response.status}: ${body.replace(/<[^>]+>/g, " ").slice(0, 200)}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`No se pudo enviar el WhatsApp: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }
}
