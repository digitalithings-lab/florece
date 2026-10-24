import { Type } from "class-transformer";
import { IsBoolean, IsIn, ValidateNested } from "class-validator";
import { CLOTH_COLORS, HAIR_COLORS, OPTIONS, SKIN_TONES } from "../character.constants";

export class CharacterLookDto {
  @IsIn(SKIN_TONES) skin: string;
  @IsIn(OPTIONS.body) body: string;
  @IsIn(OPTIONS.face) face: string;
  @IsIn(OPTIONS.eyes) eyes: string;
  @IsIn(OPTIONS.brows) brows: string;
  @IsIn(OPTIONS.mouth) mouth: string;
  @IsBoolean() blush: boolean;
  @IsIn(OPTIONS.hair) hair: string;
  @IsIn(HAIR_COLORS) hairColor: string;
  @IsIn(OPTIONS.top) top: string;
  @IsIn(CLOTH_COLORS) topColor: string;
  @IsIn(OPTIONS.bottom) bottom: string;
  @IsIn(CLOTH_COLORS) bottomColor: string;
  @IsIn(OPTIONS.shoes) shoes: string;
  @IsIn(CLOTH_COLORS) shoesColor: string;
}

export class SaveCharacterDto {
  @ValidateNested()
  @Type(() => CharacterLookDto)
  look: CharacterLookDto;
}
