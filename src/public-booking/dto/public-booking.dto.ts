import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, Equals, IsArray, IsEmail, IsIn, IsEmpty, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf, ValidateNested } from "class-validator";
import { RecurrenceDto } from "../../care/dto/care.dto";
import { cleaned } from "../../common/text";

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

// Segunda persona de una cita de pareja: todos los datos son obligatorios.
export class PartnerDto {
  @Transform(cleaned())
  @IsString()
  @Length(3, 120, { message: "Escribe el nombre completo de tu pareja" })
  @Matches(/^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u, { message: "El nombre de tu pareja solo puede llevar letras, espacios, punto, apóstrofo y guion" })
  fullName: string;

  @Transform(trim)
  @Matches(/^[A-Za-z0-9.\- ]{4,30}$/, { message: "Escribe una cédula o documento válido para tu pareja" })
  idNumber: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Escribe la fecha de nacimiento completa de tu pareja" })
  birthDate: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "El correo de tu pareja no es válido" })
  email: string;

  @Transform(trim)
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: "Escribe un teléfono válido para tu pareja" })
  phone: string;
}

export class PublicBookDto {
  @IsISO8601({ strict: true })
  startsAt: string;

  @Transform(cleaned())
  @IsString()
  @Length(3, 120, { message: "Escribe tu nombre completo" })
  @Matches(/^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u, { message: "El nombre solo puede llevar letras, espacios, punto, apóstrofo y guion" })
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

  @Transform(cleaned(true))
  @IsString()
  @Length(5, 500, { message: "Cuéntale el motivo de la cita (al menos 5 caracteres)" })
  reason: string;

  // Cómo quiere la sesión. Si no llega (clientes antiguos), se asume videollamada.
  @IsOptional()
  @IsIn(["VIDEO", "IN_PERSON"], { message: "Elige si la cita es virtual o presencial" })
  modality?: "VIDEO" | "IN_PERSON";

  // Tipo de consulta. Si no llega (sitios antiguos), se trata como individual.
  @IsOptional()
  @IsIn(["INDIVIDUAL", "COUPLE", "CHILD"], { message: "Elige el tipo de consulta" })
  clientType?: "INDIVIDUAL" | "COUPLE" | "CHILD";

  // Datos de la pareja: obligatorios solo cuando clientType es COUPLE.
  @ValidateIf((o) => o.clientType === "COUPLE")
  @ValidateNested()
  @Type(() => PartnerDto)
  partner?: PartnerDto;

  @Equals(true, { message: "Necesitamos tu autorización para agendar" })
  consent: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;

  // Citas extra que la persona eligió a mano (además de la primera): una sola solicitud, un solo CAPTCHA.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(11, { message: "Máximo 12 citas por solicitud" })
  @IsISO8601({ strict: true }, { each: true })
  extraStartsAt?: string[];

  // Código del CAPTCHA (Cloudflare Turnstile). Obligatorio solo si el servidor tiene TURNSTILE_SECRET.
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  captchaToken?: string;

  // Campo trampa: las personas no lo ven; si viene lleno, es un robot.
  @IsOptional()
  @IsEmpty({ message: "Solicitud no válida" })
  website?: string;
}
