import { Module } from "@nestjs/common";
import { CareModule } from "../care/care.module";
import { CrmModule } from "../crm/crm.module";
import { CaptchaService } from "./captcha.service";
import { PublicBookingController } from "./public-booking.controller";
import { PublicBookingService } from "./public-booking.service";

@Module({
  imports: [CareModule, CrmModule],
  controllers: [PublicBookingController],
  providers: [PublicBookingService, CaptchaService],
})
export class PublicBookingModule {}
