import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { EquipDto, PlaceItemDto } from "./dto/garden.dto";
import { GardenService } from "./garden.service";

@Controller("garden")
export class GardenController {
  constructor(private readonly garden: GardenService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.garden.garden(user.id);
  }

  @Get("shop")
  shop(@CurrentUser() user: AuthUser) {
    return this.garden.shop(user.id);
  }

  @Post("shop/:itemId/buy")
  @HttpCode(200)
  buy(@CurrentUser() user: AuthUser, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.garden.buy(user.id, itemId);
  }

  @Put("items/:userItemId/placement")
  place(
    @CurrentUser() user: AuthUser,
    @Param("userItemId", ParseUUIDPipe) userItemId: string,
    @Body() dto: PlaceItemDto,
  ) {
    return this.garden.place(user.id, userItemId, dto.x, dto.y);
  }

  @Post("items/:userItemId/water")
  @HttpCode(200)
  water(@CurrentUser() user: AuthUser, @Param("userItemId", ParseUUIDPipe) userItemId: string) {
    return this.garden.water(user.id, userItemId);
  }

  @Post("water-all")
  @HttpCode(200)
  waterAll(@CurrentUser() user: AuthUser) {
    return this.garden.waterAll(user.id);
  }

  @Put("accessory")
  equip(@CurrentUser() user: AuthUser, @Body() dto: EquipDto) {
    return this.garden.equip(user.id, dto.userItemId ?? null);
  }

  @Delete("items/:userItemId/placement")
  remove(@CurrentUser() user: AuthUser, @Param("userItemId", ParseUUIDPipe) userItemId: string) {
    return this.garden.remove(user.id, userItemId);
  }
}
