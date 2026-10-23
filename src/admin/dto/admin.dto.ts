import { ChallengeCategory, EvidenceType, FocusArea } from "@prisma/client";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class UpdatePsychologistStatusDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() verified?: boolean;
}

export class ChallengeDto {
  @IsString() @Length(3, 80) title: string;
  @IsString() @Length(3, 400) description: string;
  @IsEnum(ChallengeCategory) category: ChallengeCategory;
  @IsEnum(EvidenceType) evidenceType: EvidenceType;
  @IsArray() @ArrayUnique() @IsEnum(FocusArea, { each: true }) focusAreas: FocusArea[];
  @IsOptional() @IsString() @MaxLength(200) reflectionPrompt?: string;
  @IsInt() @Min(0) @Max(50) seedsReward: number;
  @IsOptional() @IsInt() @Min(1) @Max(120) durationMinutes?: number;
}

export class UpdateChallengeDto {
  @IsOptional() @IsString() @Length(3, 80) title?: string;
  @IsOptional() @IsString() @Length(3, 400) description?: string;
  @IsOptional() @IsEnum(ChallengeCategory) category?: ChallengeCategory;
  @IsOptional() @IsEnum(EvidenceType) evidenceType?: EvidenceType;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(FocusArea, { each: true }) focusAreas?: FocusArea[];
  @IsOptional() @IsString() @MaxLength(200) reflectionPrompt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(50) seedsReward?: number;
  @IsOptional() @IsInt() @Min(1) @Max(120) durationMinutes?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CrisisResourceDto {
  @Matches(/^[A-Z]{2}$/, { message: "countryCode debe ser un código ISO de 2 letras, p. ej. MX" }) countryCode: string;
  @IsString() @Length(2, 120) name: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== "") @IsUrl() url?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsBoolean() available24h?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) sortOrder?: number;
}

export class ReviewRiskEventDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
