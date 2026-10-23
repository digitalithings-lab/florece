import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Put } from "@nestjs/common";
import { ConsentType } from "@prisma/client";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { AvatarDto, ConsentDto, OnboardingDto, UpdateProfileDto } from "./dto/profile.dto";
import { ProfileService } from "./profile.service";

@Controller("profile")
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profile.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.id, dto);
  }

  @Post("onboarding")
  completeOnboarding(@CurrentUser() user: AuthUser, @Body() dto: OnboardingDto) {
    return this.profile.completeOnboarding(user.id, dto);
  }

  @Put("avatar")
  setAvatar(@CurrentUser() user: AuthUser, @Body() dto: AvatarDto) {
    return this.profile.setAvatar(user.id, dto);
  }

  @Post("consents")
  acceptConsent(@CurrentUser() user: AuthUser, @Body() dto: ConsentDto) {
    return this.profile.acceptConsent(user.id, dto.type);
  }

  @Delete("consents/:type")
  revokeConsent(@CurrentUser() user: AuthUser, @Param("type", new ParseEnumPipe(ConsentType)) type: ConsentType) {
    return this.profile.revokeConsent(user.id, type);
  }

  @Get("seeds")
  seeds(@CurrentUser() user: AuthUser) {
    return this.profile.seeds(user.id);
  }
}
