import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { Public } from "../common/auth.decorators";
import { CALM_EXERCISES, SafetyService } from "./safety.service";

// Pública a propósito: el botón «Necesito calmarme» y las líneas de ayuda
// deben funcionar aunque la sesión haya expirado y sin límites de plan.
@Controller("safety")
@Public()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Get("calm")
  async calm(@Query("country") country?: string) {
    if (country && !/^[A-Z]{2}$/.test(country)) {
      throw new BadRequestException("country debe ser un código ISO de 2 letras, p. ej. MX");
    }
    return {
      exercises: CALM_EXERCISES,
      resources: await this.safety.resources(country ?? null),
      emergencyNote:
        "Florece no es un servicio de emergencias. Si estás en peligro, llama al número de emergencias de tu país.",
    };
  }
}
