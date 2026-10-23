import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { Roles } from "../common/roles";
import { AdminService } from "./admin.service";
import { ChallengeDto, CrisisResourceDto, ReviewRiskEventDto, UpdateChallengeDto, UpdatePsychologistStatusDto } from "./dto/admin.dto";

@Controller("admin")
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("stats")
  stats() {
    return this.admin.stats();
  }

  @Get("psychologists")
  psychologists() {
    return this.admin.psychologists();
  }

  @Patch("psychologists/:id")
  updatePsychologist(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdatePsychologistStatusDto) {
    return this.admin.updatePsychologist(id, dto);
  }

  @Get("challenges")
  challenges() {
    return this.admin.challenges();
  }

  @Post("challenges")
  createChallenge(@Body() dto: ChallengeDto) {
    return this.admin.createChallenge(dto);
  }

  @Patch("challenges/:id")
  updateChallenge(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateChallengeDto) {
    return this.admin.updateChallenge(id, dto);
  }

  @Get("crisis-resources")
  crisisResources() {
    return this.admin.crisisResources();
  }

  @Post("crisis-resources")
  createCrisisResource(@Body() dto: CrisisResourceDto) {
    return this.admin.createCrisisResource(dto);
  }

  @Patch("crisis-resources/:id")
  updateCrisisResource(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CrisisResourceDto) {
    return this.admin.updateCrisisResource(id, dto);
  }

  @Delete("crisis-resources/:id")
  @HttpCode(204)
  async deleteCrisisResource(@Param("id", ParseUUIDPipe) id: string) {
    await this.admin.deleteCrisisResource(id);
  }

  @Get("risk-events")
  riskEvents(@Query("pending") pending?: string) {
    return this.admin.riskEvents(pending !== "false");
  }

  @Patch("risk-events/:id/review")
  reviewRiskEvent(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewRiskEventDto) {
    return this.admin.reviewRiskEvent(user.id, id, dto.notes);
  }
}
