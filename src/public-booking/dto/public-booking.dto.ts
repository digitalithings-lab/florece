import { Transform, Type } from "class-transformer";
import { Equals, IsEmail, IsIn, IsEmpty, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from "class-validator";
import { RecurrenceDto } from "../../care/dto/care.dto";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class PublicSlotsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from debe tener formato AAAA-MM-DD" })
  from?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  days?: number;
}

export class PublicBookDto {
  @IsISO8601({ strict: true })
  startsAt: string;

  @Transform(trim)
  @IsString()
  @Length(3, 120, { message: "Escribe tu nombre completo" })
  fullName: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "El correo no es válido" })
  email: string;

  @Transform(trim)
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: "Escribe un teléfono válido" })
  phone: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Za-z0-9.\- ]{4,30}$/, { message: "Escribe un número de cédula o documento válido" })
  idNumber?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Escribe tu fecha de nacimiento completa" })
  birthDate?: string;

  @Transform(trim)
  @IsString()
  @Length(5, 500, { message: "Cuéntale el motivo de la cita (al menos 5 caracteres)" })
  reason: string;

  // Cómo quiere la sesión. Si no llega (clientes antiguos), se asume videollamada.
  @IsOptional()
  @IsIn(["VIDEO", "IN_PERSON"], { message: "Elige si la cita es virtual o presencial" })
  modality?: "VIDEO" | "IN_PERSON";

  @Equals(true, { message: "Necesitamos tu autorización para agendar" })
  consent: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;

  // Campo trampa: las personas no lo ven; si viene lleno, es un robot.
  @IsOptional()
  @IsEmpty({ message: "Solicitud no válida" })
  website?: string;
}
