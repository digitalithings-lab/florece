import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/auth.decorators";
import { RetreatsService } from "./retreats.service";

@Public()
@Controller("public/retreats")
export class RetreatsController {
  constructor(private readonly retreats: RetreatsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  async getRetreats(@Query("year") year?: string) {
    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear)) {
        return this.retreats.findByYear(parsedYear);
      }
    }
    return this.retreats.findAll();
  }
}
