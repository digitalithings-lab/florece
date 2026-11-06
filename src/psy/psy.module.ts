import { Module } from "@nestjs/common";
import { CareModule } from "../care/care.module";
import { PsyController } from "./psy.controller";
import { PsyService } from "./psy.service";

@Module({
  imports: [CareModule],
  controllers: [PsyController],
  providers: [PsyService],
})
export class PsyModule {}
