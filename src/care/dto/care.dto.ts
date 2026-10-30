import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";

export class LinkCodeDto {
  @IsString()
  @Length(4, 20)
  code: string;
}

export class SlotsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from debe tener formato YYYY-MM-DD" })
  from?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  days?: number;
}

export class BookAppointmentDto {
  @IsISO8601({ strict: true })
  startsAt: string;

  // Datos de la persona para su psicólogo.
  @IsString()
  @Length(3, 120, { message: "Escribe tu nombre completo" })
  fullName: string;

  @IsString()
  @Matches(/^[A-Za-z0-9.\- ]{4,30}$/, { message: "Escribe un número de cédula o documento válido" })
  idNumber: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Escribe tu fecha de nacimiento completa" })
  birthDate: string;

  @IsString()
  @Length(5, 500, { message: "Cuéntale a tu psicólogo/a el motivo de la cita (al menos 5 caracteres)" })
  reason: string;
}
