import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { Roles } from "../common/roles";
import {
  AppointmentActionDto,
  AppointmentsQueryDto,
  AvailabilityRulesDto,
  BlockDto,
  CreateRoutineDto,
  PatientSettingsDto,
  UpdatePsyProfileDto,
  UpdateRoutineDto,
} from "./dto/psy.dto";
import { PsyService } from "./psy.service";

// Panel del psicólogo.
@Controller("psy")
@Roles(UserRole.PSYCHOLOGIST)
export class PsyController {
  constructor(private readonly psy: PsyService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.psy.me(user.id);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdatePsyProfileDto) {
    return this.psy.updateMe(user.id, dto);
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
