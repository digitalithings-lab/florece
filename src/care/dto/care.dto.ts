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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
