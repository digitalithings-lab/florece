import { ChatMode } from "@prisma/client";
import { IsEnum, IsOptional, IsString, Length } from "class-validator";

export class CreateConversationDto {
  @IsOptional()
  @IsEnum(ChatMode)
  mode?: ChatMode;
}

export class SendMessageDto {
  @IsString()
  @Length(1, 2000)
  content: string;
}
