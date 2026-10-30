import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { Roles } from "../common/roles";
import { EmotionsService } from "../emotions/emotions.service";
import {
  AppointmentActionDto,
  AppointmentsQueryDto,
  AvailabilityRulesDto,
  BlockDto,
  CreateContentDto,
  CreateRoutineDto,
  EmotionDto,
  ReorderDto,
  UpdateEmotionDto,
  PatientSettingsDto,
  UpdatePsyProfileDto,
  UpdateRoutineDto,
} from "./dto/psy.dto";
import { PsyService } from "./psy.service";

// Panel del psicólogo.
@Controller("psy")
@Roles(UserRole.PSYCHOLOGIST)
export class PsyController {
  constructor(
    private readonly psy: PsyService,
    private readonly emotionsService: EmotionsService,
  ) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.psy.me(user.id);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdatePsyProfileDto) {
    return this.psy.updateMe(user.id, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("me/notify-test")
  @HttpCode(200)
  testNotification(@CurrentUser() user: AuthUser) {
    return this.psy.testNotification(user.id);
  }

  @Post("me/link-code")
  rotateLinkCode(@CurrentUser() user: AuthUser) {
    return this.psy.rotateLinkCode(user.id);
  }

  @Get("dashboard")
  dashboard(@CurrentUser() user: AuthUser) {
    return this.psy.dashboard(user.id);
  }

  @Get("patients")
  patients(@CurrentUser() user: AuthUser) {
    return this.psy.patients(user.id);
  }

  @Get("patients/:patientId")
  patient(@CurrentUser() user: AuthUser, @Param("patientId", ParseUUIDPipe) patientId: string) {
    return this.psy.patient(user.id, patientId);
  }

  @Patch("patients/:patientId/settings")
  updatePatientSettings(
    @CurrentUser() user: AuthUser,
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Body() dto: PatientSettingsDto,
  ) {
    return this.psy.updatePatientSettings(user.id, patientId, dto.autoChallengesPerDay);
  }

  @Post("patients/:patientId/routines")
  createRoutine(
    @CurrentUser() user: AuthUser,
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Body() dto: CreateRoutineDto,
  ) {
    return this.psy.createRoutine(user.id, patientId, dto);
  }

  @Patch("routines/:routineId")
  updateRoutine(
    @CurrentUser() user: AuthUser,
    @Param("routineId", ParseUUIDPipe) routineId: string,
    @Body() dto: UpdateRoutineDto,
  ) {
    return this.psy.updateRoutine(user.id, routineId, dto);
  }

  @Post("patients/:patientId/content")
  createContent(
    @CurrentUser() user: AuthUser,
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Body() dto: CreateContentDto,
  ) {
    return this.psy.createContent(user.id, patientId, dto);
  }

  @Delete("content/:contentId")
  @HttpCode(204)
  async deleteContent(@CurrentUser() user: AuthUser, @Param("contentId", ParseUUIDPipe) contentId: string) {
    await this.psy.deleteContent(user.id, contentId);
  }

  // ─── Emociones para sus pacientes ────────────────────

  @Get("emotions")
  async emotions(@CurrentUser() user: AuthUser) {
    return this.emotionsService.forPsychologist((await this.psy.me(user.id)).id);
  }

  @Post("emotions")
  async createEmotion(@CurrentUser() user: AuthUser, @Body() dto: EmotionDto) {
    return this.emotionsService.create((await this.psy.me(user.id)).id, dto);
  }

  @Post("emotions/copy-defaults")
  async copyDefaultEmotions(@CurrentUser() user: AuthUser) {
    return this.emotionsService.copyDefaults((await this.psy.me(user.id)).id);
  }

  @Put("emotions/order")
  async reorderEmotions(@CurrentUser() user: AuthUser, @Body() dto: ReorderDto) {
    return this.emotionsService.reorder((await this.psy.me(user.id)).id, dto.ids);
  }

  @Patch("emotions/:id")
  async updateEmotion(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateEmotionDto) {
    return this.emotionsService.update((await this.psy.me(user.id)).id, id, dto);
  }

  @Delete("emotions/:id")
  async deleteEmotion(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.emotionsService.remove((await this.psy.me(user.id)).id, id);
  }

  @Get("catalog")
  catalog(@CurrentUser() user: AuthUser) {
    return this.psy.catalog(user.id);
  }

  @Get("availability")
  availability(@CurrentUser() user: AuthUser) {
    return this.psy.availability(user.id);
  }

  @Put("availability/rules")
  setRules(@CurrentUser() user: AuthUser, @Body() dto: AvailabilityRulesDto) {
    return this.psy.setRules(user.id, dto.rules);
  }

  @Post("availability/blocks")
  addBlock(@CurrentUser() user: AuthUser, @Body() dto: BlockDto) {
    return this.psy.addBlock(user.id, dto);
  }

  @Delete("availability/blocks/:blockId")
  removeBlock(@CurrentUser() user: AuthUser, @Param("blockId", ParseUUIDPipe) blockId: string) {
    return this.psy.removeBlock(user.id, blockId);
  }

  @Get("appointments")
  appointments(@CurrentUser() user: AuthUser, @Query() query: AppointmentsQueryDto) {
    return this.psy.appointments(user.id, query);
  }

  @Patch("appointments/:appointmentId")
  actOnAppointment(
    @CurrentUser() user: AuthUser,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
    @Body() dto: AppointmentActionDto,
  ) {
    return this.psy.actOnAppointment(user.id, appointmentId, dto);
  }
}
