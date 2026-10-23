import { AppointmentStatus, EvidenceType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class UpdatePsyProfileDto {
  @IsOptional() @IsString() @Length(3, 80) fullName?: string;
  @IsOptional() @IsString() @Length(3, 40) licenseNumber?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  specialties?: string[];

  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== "") @IsUrl() photoUrl?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) sessionPriceCents?: number;
  @IsOptional() @Matches(/^[A-Z]{3}$/, { message: "currency debe ser un código de 3 letras, p. ej. MXN" }) currency?: string;
  @IsOptional() @IsInt() @Min(20) @Max(120) sessionMinutes?: number;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== "") @IsUrl({}, { message: "El enlace de videollamada no es válido" }) defaultMeetingUrl?: string;
}

export class PatientSettingsDto {
  @IsInt()
  @Min(0)
  @Max(6)
  autoChallengesPerDay: number;
}

// Por ahora el psicólogo asigna retos con respuesta escrita o con reflexión.
const ROUTINE_EVIDENCE = [EvidenceType.TEXT, EvidenceType.INTERACTIVE];

export class CreateRoutineDto {
  @IsString() @Length(3, 80) title: string;
  @IsString() @Length(3, 600) description: string;
  @IsIn(ROUTINE_EVIDENCE) evidenceType: EvidenceType;
  @IsOptional() @IsString() @MaxLength(200) reflectionPrompt?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "Elige al menos un día de la semana" })
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays: number[];

  @IsOptional() @Matches(DATE) startDate?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(DATE) endDate?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(50) seedsReward?: number;
}

export class UpdateRoutineDto {
  @IsOptional() @IsString() @Length(3, 80) title?: string;
  @IsOptional() @IsString() @Length(3, 600) description?: string;
  @IsOptional() @IsIn(ROUTINE_EVIDENCE) evidenceType?: EvidenceType;
  @IsOptional() @IsString() @MaxLength(200) reflectionPrompt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(DATE) endDate?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(50) seedsReward?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class RuleDto {
  @IsInt() @Min(0) @Max(6) weekday: number;
  @IsInt() @Min(0) @Max(1439) startMinute: number;
  @IsInt() @Min(1) @Max(1440) endMinute: number;
}

export class AvailabilityRulesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules: RuleDto[];
}

export class BlockDto {
  @IsISO8601({ strict: true }) startsAt: string;
  @IsISO8601({ strict: true }) endsAt: string;
  @IsOptional() @IsString() @MaxLength(120) reason?: string;
}

export class AppointmentsQueryDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
}

export class AppointmentActionDto {
  @IsIn(["confirm", "cancel", "complete", "no_show", "update"])
  action: "confirm" | "cancel" | "complete" | "no_show" | "update";

  @IsOptional() @ValidateIf((_o, v) => v !== "") @IsUrl({}, { message: "El enlace de videollamada no es válido" }) meetingUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) cancelReason?: string;
}
