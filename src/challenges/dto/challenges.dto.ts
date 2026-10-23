import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CompleteChallengeDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  textContent?: string;

  // Ruta del audio o la foto ya subidos al almacenamiento privado.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  mediaKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  mediaDurationSec?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reflection?: string;
}

export class HistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
