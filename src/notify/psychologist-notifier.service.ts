import { Injectable } from "@nestjs/common";
import { Psychologist } from "@prisma/client";
import { SmsService } from "./sms.service";
import { WhatsappService } from "./whatsapp.service";

export type NotifyChannel = "whatsapp" | "sms" | null;

// Avisa al psicólogo en su celular: por WhatsApp si activó CallMeBot; si no, por SMS si Twilio está configurado.
@Injectable()
export class PsychologistNotifier {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly sms: SmsService,
  ) {}

  async notify(psychologist: Pick<Psychologist, "notifyPhone" | "notifyWhatsappKey">, text: string): Promise<NotifyChannel> {
    if (!psychologist.notifyPhone) return null;
    if (psychologist.notifyWhatsappKey && (await this.whatsapp.send(psychologist.notifyPhone, psychologist.notifyWhatsappKey, text))) {
      return "whatsapp";
    }
    if (this.sms.enabled && (await this.sms.send(psychologist.notifyPhone, text))) return "sms";
    return null;
  }
}
