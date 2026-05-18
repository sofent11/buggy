import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { CreateProjectDto, DecideProjectJoinRequestDto, UpdateProjectDto, UpsertProjectMemberDto } from '../dto/project.dto.js';
import { ProjectService } from '../services/project.service.js';
import { ProjectCleanupService } from '../services/project-cleanup.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly cleanup: ProjectCleanupService
  ) {}

  @Get()
  list(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    return this.projects.list(user, query);
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
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const result = await this.projects.remove(id, user);
    await this.cleanup.removeProjectData(id);
    return result;
  }

  @Post(':id/members')
  upsertMember(@Param('id') id: string, @Body() dto: UpsertProjectMemberDto, @CurrentUser() user: SessionUser) {
    return this.projects.upsertMember(id, dto, user);
  }

  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: SessionUser) {
    return this.projects.removeMember(id, userId, user);
  }

  @Post(':id/join-requests')
  requestJoin(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.projects.requestJoin(id, user);
  }

  @Get(':id/join-requests')
  listJoinRequests(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.projects.listJoinRequests(id, user);
  }

  @Post(':id/join-requests/:requestId/approve')
  approveJoinRequest(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() dto: DecideProjectJoinRequestDto,
    @CurrentUser() user: SessionUser
  ) {
    return this.projects.approveJoinRequest(id, requestId, dto, user);
  }

  @Post(':id/join-requests/:requestId/reject')
  rejectJoinRequest(@Param('id') id: string, @Param('requestId') requestId: string, @CurrentUser() user: SessionUser) {
    return this.projects.rejectJoinRequest(id, requestId, user);
  }
}
