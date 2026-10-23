import { Module } from "@nestjs/common";
import { JournalController, MoodsController } from "./journal.controller";
import { JournalService } from "./journal.service";

@Module({
  controllers: [JournalController, MoodsController],
  providers: [JournalService],
})
export class JournalModule {}
