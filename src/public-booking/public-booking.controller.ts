import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/auth.decorators";
import { PublicBookDto, PublicSlotsQueryDto } from "./dto/public-booking.dto";
import { PublicBookingService } from "./public-booking.service";

// Sin sesión: lo consume el sitio web del psicólogo (p. ej. espaciovitalpsic.site/agendar).
@Public()
@Controller("public/booking")
export class PublicBookingController {
  constructor(private readonly booking: PublicBookingService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(":slug")
  info(@Param("slug") slug: string, @Query() query: PublicSlotsQueryDto) {
    return this.booking.info(slug, query.from, query.days);
  }

  // Límite estricto: nadie necesita pedir más de unas pocas citas por minuto.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(":slug/appointments")
  book(@Param("slug") slug: string, @Body() dto: PublicBookDto) {
    return this.booking.book(slug, dto);
  }
}
