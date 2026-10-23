import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { ChallengesService } from "./challenges.service";
import { CompleteChallengeDto, HistoryQueryDto } from "./dto/challenges.dto";

@Controller("challenges")
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get("today")
  today(@CurrentUser() user: AuthUser) {
    return this.challenges.today(user.id);
  }

  @Get("history")
  history(@CurrentUser() user: AuthUser, @Query() query: HistoryQueryDto) {
    return this.challenges.history(user.id, query.days ?? 30);
  }

  @Post(":id/complete")
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CompleteChallengeDto,
  ) {
    return this.challenges.complete(user.id, id, dto);
  }

  @Post(":id/skip")
  @HttpCode(200)
  skip(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.challenges.skip(user.id, id);
  }

  // Retos asignados por el psicólogo.
  @Post("routines/:routineId/complete")
  @HttpCode(200)
  completeRoutine(
    @CurrentUser() user: AuthUser,
    @Param("routineId", ParseUUIDPipe) routineId: string,
    @Body() dto: CompleteChallengeDto,
  ) {
    return this.challenges.completeRoutine(user.id, routineId, dto);
  }
}
