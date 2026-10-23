import { Global, Module } from "@nestjs/common";
import { AiUsageService } from "./ai-usage.service";
import { GroqService } from "./groq.service";

@Global()
@Module({
  providers: [GroqService, AiUsageService],
  exports: [GroqService, AiUsageService],
})
export class GroqModule {}
