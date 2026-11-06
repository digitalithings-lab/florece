import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { config } from "../config";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Comprueba el CAPTCHA (Cloudflare Turnstile) del formulario de agendar.
// Sin TURNSTILE_SECRET no se exige, para no romper la agenda mientras se configura.
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  async verify(token: string | undefined, ip?: string): Promise<void> {
    if (!config.turnstileSecret) return;
    if (!token) throw new BadRequestException("Confirma que eres una persona para enviar tu solicitud.");

    let success = false;
    try {
      const body = new URLSearchParams({ secret: config.turnstileSecret, response: token });
      if (ip) body.set("remoteip", ip);
      const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5_000) });
      success = Boolean(((await res.json()) as { success?: boolean }).success);
    } catch (err) {
      // Si Cloudflare no responde, no se deja a las personas sin poder agendar; el límite de peticiones sigue activo.
      this.logger.error(`No se pudo consultar Turnstile: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (!success) throw new BadRequestException("No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.");
  }
}
