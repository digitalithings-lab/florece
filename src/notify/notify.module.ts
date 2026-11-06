import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { PsychologistNotifier } from "./psychologist-notifier.service";
import { PushService } from "./push.service";
import { SmsService } from "./sms.service";
import { WhatsappService } from "./whatsapp.service";

@Global()
@Module({
  providers: [MailService, SmsService, WhatsappService, PushService, PsychologistNotifier],
  exports: [PsychologistNotifier, PushService, MailService],
})
export class NotifyModule {}
