import { Module } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { CrmAgendaController } from "./crm-agenda.controller";

@Module({
  controllers: [CrmAgendaController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
