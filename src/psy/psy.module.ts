import { Module } from "@nestjs/common";
import { CareModule } from "../care/care.module";
import { CrmModule } from "../crm/crm.module";
import { PsyController } from "./psy.controller";
import { PsyService } from "./psy.service";

@Module({
  imports: [CareModule, CrmModule],
  controllers: [PsyController],
  providers: [PsyService],
})
export class PsyModule {}
