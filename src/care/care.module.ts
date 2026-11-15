import { Module } from "@nestjs/common";
import { CrmModule } from "../crm/crm.module";
import { CareController } from "./care.controller";
import { CareService } from "./care.service";

@Module({
  imports: [CrmModule],
  controllers: [CareController],
  providers: [CareService],
  exports: [CareService],
})
export class CareModule {}
