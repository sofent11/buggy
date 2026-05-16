import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UpsertSavedViewDto } from '../dto/saved-view.dto.js';
import { SavedViewService } from '../services/saved-view.service.js';
import { ProjectService } from '../services/project.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('saved-views')
@UseGuards(AuthGuard)
export class SavedViewController {
  constructor(
    private readonly views: SavedViewService,
    private readonly projects: ProjectService
  ) {}

  @Get()
  async list(@Query('projectId') projectId: string, @Query('tab') tab: string | undefined, @CurrentUser() user: SessionUser) {
    await this.projects.get(projectId, user);
    return this.views.list(projectId, user, tab);
  }

  @Post()
  async upsert(@Body() dto: UpsertSavedViewDto, @CurrentUser() user: SessionUser) {
    await this.projects.get(dto.projectId, user);
    return this.views.upsert(dto, user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.views.remove(id, user);
  }
}
