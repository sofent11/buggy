import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateProjectDto, UpdateProjectDto, UpsertProjectMemberDto } from '../dto/project.dto.js';
import { ProjectService } from '../services/project.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.projects.list(user);
  }

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: SessionUser) {
    return this.projects.create(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.projects.get(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: SessionUser) {
    return this.projects.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.projects.remove(id, user);
  }

  @Post(':id/members')
  upsertMember(@Param('id') id: string, @Body() dto: UpsertProjectMemberDto, @CurrentUser() user: SessionUser) {
    return this.projects.upsertMember(id, dto, user);
  }

  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: SessionUser) {
    return this.projects.removeMember(id, userId, user);
  }
}
