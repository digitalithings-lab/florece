import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { CareService } from "./care.service";
import { BookAppointmentDto, LinkCodeDto, SlotsQueryDto } from "./dto/care.dto";

// Lado del paciente: vínculo con su psicólogo y citas.
@Controller("care")
export class CareController {
  constructor(private readonly care: CareService) {}

  @Get()
  current(@CurrentUser() user: AuthUser) {
    return this.care.current(user.id);
  }

  // Límite estricto para que no se puedan adivinar códigos probando muchos.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("preview")
  @HttpCode(200)
  preview(@Body() dto: LinkCodeDto) {
    return this.care.preview(dto.code);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("link")
  link(@CurrentUser() user: AuthUser, @Body() dto: LinkCodeDto) {
    return this.care.link(user.id, user.role, dto.code);
  }

  @Delete("link")
  unlink(@CurrentUser() user: AuthUser) {
    return this.care.unlink(user.id);
  }

  @Get("slots")
  slots(@CurrentUser() user: AuthUser, @Query() query: SlotsQueryDto) {
    return this.care.slots(user.id, query.from, query.days ?? 14);
  }

  @Get("appointments")
  appointments(@CurrentUser() user: AuthUser) {
    return this.care.appointments(user.id);
  }

  @Post("appointments")
  book(@CurrentUser() user: AuthUser, @Body() dto: BookAppointmentDto) {
    return this.care.book(user.id, dto.startsAt, dto.note);
  }

  @Post("appointments/:id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.care.cancel(user.id, id);
  }
}
