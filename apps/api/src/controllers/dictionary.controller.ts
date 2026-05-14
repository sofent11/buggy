import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UpsertDictionaryDto } from '../dto/dictionary.dto.js';
import { DictionaryService } from '../services/dictionary.service.js';
import { AuthGuard } from '../shared/auth.guard.js';

@Controller('dictionaries')
@UseGuards(AuthGuard)
export class DictionaryController {
  constructor(private readonly dictionaries: DictionaryService) {}

  @Get()
  list(@Query('projectId') projectId?: string) {
    return this.dictionaries.list(projectId);
  }

  @Post()
  upsert(@Body() dto: UpsertDictionaryDto) {
    return this.dictionaries.upsert(dto);
  }
}
