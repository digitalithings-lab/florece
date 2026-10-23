import { IsInt, Max, Min } from "class-validator";
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
