import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AddBugAttachmentDto, AddBugCommentDto, CreateBugDto, CreateBugFromRunDto, UpdateBugDto } from '../dto/bug.dto.js';
import { ListQueryDto } from '../dto/common.dto.js';
import { BugService } from '../services/bug.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';
import { ProjectService } from '../services/project.service.js';
import { TestPlanService } from '../services/test-plan.service.js';

@Controller('bugs')
@UseGuards(AuthGuard)
export class BugController {
  constructor(
    private readonly bugs: BugService,
    private readonly projects: ProjectService,
    private readonly plans: TestPlanService
  ) {}

  @Get()
  async list(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.bugs.list(query);
  }

  @Post()
  async create(@Body() dto: CreateBugDto, @CurrentUser() user: SessionUser) {
    await this.projects.get(dto.projectId, user);
    return this.bugs.create(dto, user);
  }

  @Post('from-run')
  async createFromRun(@Body() dto: CreateBugFromRunDto, @CurrentUser() user: SessionUser) {
    await this.projects.get(await this.plans.projectIdOf(dto.testPlanId), user);
    return this.bugs.createFromRun(dto, user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBugDto, @CurrentUser() user: SessionUser) {
    await this.projects.get(await this.bugs.projectIdOf(id), user);
    return this.bugs.update(id, dto, user);
  }

  @Post(':id/comments')
  async addComment(@Param('id') id: string, @Body() dto: AddBugCommentDto, @CurrentUser() user: SessionUser) {
    await this.projects.get(await this.bugs.projectIdOf(id), user);
    return this.bugs.addComment(id, dto, user);
  }

  @Post(':id/attachments')
  async addAttachment(@Param('id') id: string, @Body() dto: AddBugAttachmentDto, @CurrentUser() user: SessionUser) {
    await this.projects.get(await this.bugs.projectIdOf(id), user);
    return this.bugs.addAttachment(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.assertManage(await this.bugs.projectIdOf(id), user);
    return this.bugs.remove(id);
  }
}
