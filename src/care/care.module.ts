import { Module } from "@nestjs/common";
import { CareController } from "./care.controller";
import { CareService } from "./care.service";

@Module({
  controllers: [CareController],
  providers: [CareService],
  exports: [CareService],
})
export class CareModule {}
