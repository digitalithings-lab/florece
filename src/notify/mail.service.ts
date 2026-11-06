import { Injectable, Logger } from "@nestjs/common";
import { createTransport, Transporter } from "nodemailer";
import { config } from "../config";

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

// Envío de correos por SMTP. Nunca lanza: si falla, lo registra y devuelve false, para que una
// cita jamás se pierda por un problema de correo.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  get enabled() {
    return Boolean(config.mail.user && config.mail.pass && config.mail.from);
  }

  async send(message: MailMessage): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn("Correo omitido: faltan MAIL_USER o MAIL_PASS");
      return false;
    }
    try {
      this.transporter ??= createTransport({
        host: config.mail.host,
        port: config.mail.port,
        secure: config.mail.port === 465,
        auth: { user: config.mail.user, pass: config.mail.pass },
        connectionTimeout: 8_000,
        greetingTimeout: 8_000,
        socketTimeout: 12_000,
      });
      await this.transporter.sendMail({
        from: { name: config.mail.fromName, address: config.mail.from },
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return true;
    } catch (err) {
      this.logger.error(`No se pudo enviar el correo «${message.subject}»: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}
