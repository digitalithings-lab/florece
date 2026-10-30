import { Injectable, Logger } from "@nestjs/common";
import { config } from "../config";

// Envío de SMS con la API REST de Twilio (sin SDK). Nunca hace fallar la operación que lo llama.
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  get enabled() {
    const { twilioAccountSid, twilioAuthToken, from } = config.sms;
    return Boolean(twilioAccountSid && twilioAuthToken && from);
  }

  async send(to: string, body: string): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn("SMS sin configurar (TWILIO_*): no se envió el aviso");
      return false;
    }
    const { twilioAccountSid, twilioAuthToken, from } = config.sms;
    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1500) }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        this.logger.error(`Twilio respondió ${response.status}: ${(await response.text()).slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`No se pudo enviar el SMS: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }
}
