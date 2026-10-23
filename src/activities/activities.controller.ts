import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { ActivitiesService } from "./activities.service";
import { LogActivityDto } from "./dto/activities.dto";

@Controller("activities")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.activities.status(user.id);
  }

  @Post("log")
  log(@CurrentUser() user: AuthUser, @Body() dto: LogActivityDto) {
    return this.activities.log(user.id, dto);
  }

  @Get("gratitude")
  gratitudeJar(@CurrentUser() user: AuthUser) {
    return this.activities.gratitudeJar(user.id);
  }

  @Post("content/:id/complete")
  @HttpCode(200)
  completeContent(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.activities.completeContent(user.id, id);
  }
}
