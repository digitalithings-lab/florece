import { Body, Controller, Get, Put } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import { CharacterService } from "./character.service";
import { SaveCharacterDto } from "./dto/character.dto";

@Controller("character")
export class CharacterController {
  constructor(private readonly character: CharacterService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.character.get(user.id);
  }

  @Put()
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveCharacterDto) {
    return this.character.save(user.id, dto.look);
  }
}
