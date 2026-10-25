import { ConsentType } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const lowercaseTrim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(lowercaseTrim)
  @IsEmail({}, { message: "El correo no es válido" })
  email: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(128)
  password: string;

  @IsString()
  @Length(1, 40)
  displayName: string;

  @IsISO8601({ strict: true }, { message: "birthDate debe tener formato YYYY-MM-DD" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "birthDate debe tener formato YYYY-MM-DD" })
  birthDate: string;

  // Deben incluir TERMS, PRIVACY y SENSITIVE_DATA. AI_PROCESSING es opcional
  // y se requiere solo para usar el chat y las reflexiones del diario.
  @IsArray()
  @ArrayUnique()
  @IsEnum(ConsentType, { each: true })
  consents: ConsentType[];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: "countryCode debe ser un código ISO de 2 letras, p. ej. MX" })
  countryCode?: string;
}

export class RegisterPsychologistDto {
  @Transform(lowercaseTrim)
  @IsEmail({}, { message: "El correo no es válido" })
  email: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(128)
  password: string;

  @IsString()
  @Length(3, 80, { message: "Escribe tu nombre completo (de 3 a 80 caracteres)" })
  fullName: string;

  @IsString()
  @Length(3, 40, { message: "Escribe tu número de cédula profesional" })
  licenseNumber: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  specialties?: string[];

  @IsOptional()
  @IsString()
  timezone?: string;

  // Deben incluir TERMS y PRIVACY.
  @IsArray()
  @ArrayUnique()
  @IsEnum(ConsentType, { each: true })
  consents: ConsentType[];
}

export class LoginDto {
  @Transform(lowercaseTrim)
  @IsEmail({}, { message: "El correo no es válido" })
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(200)
  refreshToken: string;
}
