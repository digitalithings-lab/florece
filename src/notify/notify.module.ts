import { Global, Module } from "@nestjs/common";
import { PsychologistNotifier } from "./psychologist-notifier.service";
import { SmsService } from "./sms.service";
import { WhatsappService } from "./whatsapp.service";

@Global()
@Module({
  providers: [SmsService, WhatsappService, PsychologistNotifier],
  exports: [PsychologistNotifier],
})
export class NotifyModule {}
