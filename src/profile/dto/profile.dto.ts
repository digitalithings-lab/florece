import { AvatarSpecies, ConsentType, FocusArea } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  displayName?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsEnum(FocusArea, { each: true })
  focusAreas?: FocusArea[];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: "countryCode debe ser un código ISO de 2 letras, p. ej. MX" })
  countryCode?: string;
}

export class AvatarDto {
  @IsEnum(AvatarSpecies)
  species: AvatarSpecies;

  @IsString()
  @Length(1, 30)
  name: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "color debe ser hexadecimal, p. ej. #F4A261" })
  color?: string;
}

export class OnboardingDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1, { message: "Elige al menos un área que quieras fortalecer" })
  @ArrayMaxSize(6)
  @IsEnum(FocusArea, { each: true })
  focusAreas: FocusArea[];

  @ValidateNested()
  @Type(() => AvatarDto)
  avatar: AvatarDto;
}

export class ConsentDto {
  @IsEnum(ConsentType)
  type: ConsentType;
}
