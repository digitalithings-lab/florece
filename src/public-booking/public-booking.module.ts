import { Module } from "@nestjs/common";
import { CareModule } from "../care/care.module";
import { PublicBookingController } from "./public-booking.controller";
import { PublicBookingService } from "./public-booking.service";

@Module({
  imports: [CareModule],
  controllers: [PublicBookingController],
  providers: [PublicBookingService],
})
export class PublicBookingModule {}
