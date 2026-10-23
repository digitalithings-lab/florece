import { Emotion } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CreateJournalEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsString()
  @Length(1, 20000)
  content: string;

  @IsOptional()
  @IsUUID()
  promptId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  theme?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "pageColor debe ser hexadecimal, p. ej. #FFF4E6" })
  pageColor?: string;
}

export class UpdateJournalEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  theme?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "pageColor debe ser hexadecimal, p. ej. #FFF4E6" })
  pageColor?: string;
}

export class ListJournalQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateMoodDto {
  // Emoción de la lista disponible para la persona (GET /moods/options).
  @ValidateIf((o: CreateMoodDto) => !o.emotion)
  @IsUUID()
  emotionOptionId?: string;

  // Compatibilidad con apps anteriores, que enviaban el nombre fijo de la emoción.
  @IsOptional()
  @IsEnum(Emotion)
  emotion?: Emotion;

  @IsInt()
  @Min(1)
  @Max(5)
  intensity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Por defecto, hoy en la zona horaria de la persona.
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date debe tener formato YYYY-MM-DD" })
  date?: string;
}

export class MoodMonthQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "month debe tener formato YYYY-MM" })
  month: string;
}
