import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { ChatService } from "./chat.service";
import { CreateConversationDto, SendMessageDto } from "./dto/chat.dto";

@Controller("chat")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get("usage")
  usage(@CurrentUser() user: AuthUser) {
    return this.chat.usageStatus(user.id);
  }

  @Get("conversations")
  list(@CurrentUser() user: AuthUser) {
    return this.chat.list(user.id);
  }

  @Post("conversations")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConversationDto) {
    return this.chat.create(user.id, dto.mode);
  }

  @Get("conversations/:id/messages")
  messages(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.chat.messages(user.id, id);
  }

  // Evita ráfagas de mensajes además del límite diario por plan.
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post("conversations/:id/messages")
  @HttpCode(200)
  send(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.chat.send(user.id, id, dto.content);
  }

  @Post("conversations/:id/end")
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.chat.end(user.id, id);
  }
}
