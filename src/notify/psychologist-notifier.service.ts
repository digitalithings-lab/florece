import { Injectable } from "@nestjs/common";
import { Psychologist } from "@prisma/client";
import { config } from "../config";
import { PushPayload, PushService } from "./push.service";
import { SmsService } from "./sms.service";
import { WhatsappService } from "./whatsapp.service";

export type NotifyChannel = "push" | "whatsapp" | "sms" | null;

// Avisa al psicólogo: push en sus dispositivos y, si tiene celular, por WhatsApp (su clave o WHATSAPP_NOTIFY_APIKEY) o SMS (Twilio).
@Injectable()
export class PsychologistNotifier {
  constructor(
    private readonly push: PushService,
    private readonly whatsapp: WhatsappService,
    private readonly sms: SmsService,
  ) {}

  async notify(
    psychologist: Pick<Psychologist, "id" | "notifyPhone" | "notifyWhatsappKey">,
    text: string,
    push?: PushPayload,
  ): Promise<NotifyChannel> {
    const [pushed, phone] = await Promise.all([push ? this.push.send(psychologist.id, push) : 0, this.notifyPhone(psychologist, text)]);
    return phone ?? (pushed > 0 ? "push" : null);
  }

  private async notifyPhone(psychologist: Pick<Psychologist, "notifyPhone" | "notifyWhatsappKey">, text: string): Promise<NotifyChannel> {
    if (!psychologist.notifyPhone) return null;
    const key = psychologist.notifyWhatsappKey || config.whatsappNotifyKey;
    if (key && (await this.whatsapp.send(psychologist.notifyPhone, key, text))) return "whatsapp";
    if (this.sms.enabled && (await this.sms.send(psychologist.notifyPhone, text))) return "sms";
    return null;
  }
}
