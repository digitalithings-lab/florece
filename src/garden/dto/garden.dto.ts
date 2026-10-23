import { IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from "class-validator";

export class EquipDto {
  // null para quitar el accesorio.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  userItemId?: string | null;
}
import { GARDEN_COLS, GARDEN_ROWS } from "../garden.constants";

export class PlaceItemDto {
  @IsInt()
  @Min(0)
  @Max(GARDEN_COLS - 1)
  x: number;

  @IsInt()
  @Min(0)
  @Max(GARDEN_ROWS - 1)
  y: number;
}
