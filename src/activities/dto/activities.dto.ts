import { ActivityType } from "@prisma/client";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

// CONTENT se registra al completar el contenido asignado, no aquí.
const LOGGABLE = Object.values(ActivityType).filter((t) => t !== ActivityType.CONTENT);

export class LogActivityDto {
  @IsIn(LOGGABLE)
  type: ActivityType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3 * 60 * 60)
  durationSec?: number;

  // Solo para GRATITUDE: de 1 a 3 cosas buenas del día.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Length(2, 300, { each: true })
  gratitude?: string[];
}
