import { Module } from "@nestjs/common";
import { PsyController } from "./psy.controller";
import { PsyService } from "./psy.service";

@Module({
  controllers: [PsyController],
  providers: [PsyService],
})
export class PsyModule {}
