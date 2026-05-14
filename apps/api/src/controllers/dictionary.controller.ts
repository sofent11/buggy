import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UpsertDictionaryDto } from '../dto/dictionary.dto.js';
import { DictionaryService } from '../services/dictionary.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { ProjectService } from '../services/project.service.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('dictionaries')
@UseGuards(AuthGuard)
export class DictionaryController {
  constructor(
    private readonly dictionaries: DictionaryService,
    private readonly projects: ProjectService
  ) {}

  @Get()
  async list(@Query('projectId') projectId: string | undefined, @CurrentUser() user: SessionUser) {
    if (projectId) await this.projects.get(projectId, user);
    return this.dictionaries.list(projectId);
  }

  @Post()
  async upsert(@Body() dto: UpsertDictionaryDto, @CurrentUser() user: SessionUser) {
    if (dto.projectId) await this.projects.assertManage(dto.projectId, user);
    return this.dictionaries.upsert(dto);
  }
}
