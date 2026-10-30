import { AppointmentStatus, ContentKind, EvidenceType } from "@prisma/client";
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

// Solo servicios push de los navegadores (Chrome/Android, Firefox, Safari/iPhone, Edge): el backend hace POST a esta URL.
const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

class PushKeysDto {
  @IsString() @Length(20, 200) p256dh!: string;
  @IsString() @Length(8, 100) auth!: string;
}

export class PushSubscriptionDto {
  @IsString() @MaxLength(1000) @Matches(PUSH_ENDPOINT, { message: "Servicio de notificaciones no compatible" }) endpoint!: string;
  @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto;
}

export class PushEndpointDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

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
  @IsOptional() @IsInt() @Min(0) @Max(60) bufferMinutes?: number;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== "") @IsUrl({}, { message: "El enlace de videollamada no es válido" }) defaultMeetingUrl?: string;

  // Agenda pública en el sitio web del psicólogo.
  @IsOptional() @IsBoolean() publicBookingEnabled?: boolean;
  @IsOptional()
  @ValidateIf((_o, v) => v !== "")
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: "El enlace solo puede tener minúsculas, números y guiones (p. ej. nathalie-vera)" })
  @Length(3, 40, { message: "El enlace debe tener entre 3 y 40 caracteres" })
  publicSlug?: string;
  @IsOptional()
  @ValidateIf((_o, v) => v !== "")
  @Matches(/^\+[1-9]\d{7,14}$/, { message: "Escribe el celular con código de país, sin espacios (p. ej. +50760000000)" })
  notifyPhone?: string;
  @IsOptional()
  @ValidateIf((_o, v) => v !== "")
  @Matches(/^[A-Za-z0-9]{4,20}$/, { message: "La clave de TextMeBot o CallMeBot no es válida" })
  notifyWhatsappKey?: string;
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

export class CreateContentDto {
  @IsString() @Length(3, 120) title: string;
  @IsIn([ContentKind.READING, ContentKind.LINK]) kind: ContentKind;
  // READING: texto para leer en la app. LINK: enlace a un video o artículo.
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsUrl({}, { message: "El enlace no es válido" }) url?: string;
}

export class EmotionDto {
  @IsString() @Length(1, 30) label: string;
  @IsString() @Length(1, 16) emoji: string;
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "El color debe ser hexadecimal, p. ej. #F6C453" }) color: string;
}

export class UpdateEmotionDto {
  @IsOptional() @IsString() @Length(1, 30) label?: string;
  @IsOptional() @IsString() @Length(1, 16) emoji?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: "El color debe ser hexadecimal, p. ej. #F6C453" }) color?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ReorderDto {
  @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) ids: string[];
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
