import { Module } from "@nestjs/common";
import { RetreatsController } from "./retreats.controller";
import { RetreatsService } from "./retreats.service";

@Module({
  controllers: [RetreatsController],
  providers: [RetreatsService],
  exports: [RetreatsService],
})
export class RetreatsModule {}
