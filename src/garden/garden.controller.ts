import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { PlaceItemDto } from "./dto/garden.dto";
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

  @Delete("items/:userItemId/placement")
  remove(@CurrentUser() user: AuthUser, @Param("userItemId", ParseUUIDPipe) userItemId: string) {
    return this.garden.remove(user.id, userItemId);
  }
}
