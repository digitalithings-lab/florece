import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/auth.decorators";
import {
  CreateJournalEntryDto,
  CreateMoodDto,
  ListJournalQueryDto,
  MoodMonthQueryDto,
  UpdateJournalEntryDto,
} from "./dto/journal.dto";
import { JournalService } from "./journal.service";

@Controller("journal")
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get("prompts")
  prompts(@CurrentUser() user: AuthUser) {
    return this.journal.prompts(user.id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListJournalQueryDto) {
    return this.journal.list(user.id, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJournalEntryDto) {
    return this.journal.create(user.id, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.journal.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateJournalEntryDto) {
    return this.journal.update(user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.journal.remove(user.id, id);
  }

  @Post(":id/reflection")
  @HttpCode(200)
  reflect(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.journal.reflect(user.id, id);
  }
}

@Controller("moods")
export class MoodsController {
  constructor(private readonly journal: JournalService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMoodDto) {
    return this.journal.createMood(user.id, dto);
  }

  // Emociones que esta persona puede registrar (las de su psicólogo o las de por defecto).
  @Get("options")
  options(@CurrentUser() user: AuthUser) {
    return this.journal.moodOptions(user.id);
  }

  @Get()
  month(@CurrentUser() user: AuthUser, @Query() query: MoodMonthQueryDto) {
    return this.journal.moodsForMonth(user.id, query.month);
  }
}
