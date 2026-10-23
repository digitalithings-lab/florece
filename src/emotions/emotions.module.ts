import { Global, Module } from "@nestjs/common";
import { EmotionsService } from "./emotions.service";

@Global()
@Module({
  providers: [EmotionsService],
  exports: [EmotionsService],
})
export class EmotionsModule {}
