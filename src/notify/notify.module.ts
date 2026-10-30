import { Global, Module } from "@nestjs/common";
import { PsychologistNotifier } from "./psychologist-notifier.service";
import { PushService } from "./push.service";
import { SmsService } from "./sms.service";
import { WhatsappService } from "./whatsapp.service";

@Global()
@Module({
  providers: [SmsService, WhatsappService, PushService, PsychologistNotifier],
  exports: [PsychologistNotifier, PushService],
})
export class NotifyModule {}
