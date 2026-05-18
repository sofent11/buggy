import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AddBugAttachmentDto, AddBugCommentDto, CreateBugDto, CreateBugFromRunDto, MarkDuplicateBugDto, TransitionBugDto, UpdateBugDto } from '../dto/bug.dto.js';
import { ListQueryDto } from '../dto/common.dto.js';
import { BugService } from '../services/bug.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';
import { ProjectService } from '../services/project.service.js';
import { TestPlanService } from '../services/test-plan.service.js';
import { UploadService } from '../services/upload.service.js';

@Controller('bugs')
@UseGuards(AuthGuard)
export class BugController {
  constructor(
    private readonly bugs: BugService,
    private readonly projects: ProjectService,
    private readonly plans: TestPlanService,
    private readonly uploads: UploadService
  ) {}

  @Get()
  async list(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.bugs.list(query);
  }

  @Post()
  async create(@Body() dto: CreateBugDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(dto.projectId, user, 'bugs', 'create');
    return this.bugs.create(dto, user);
  }

  @Post('from-run')
  async createFromRun(@Body() dto: CreateBugFromRunDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.plans.projectIdOf(dto.testPlanId), user, 'bugs', 'create');
    return this.bugs.createFromRun(dto, user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBugDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.bugs.projectIdOf(id), user, 'bugs', 'edit');
    return this.bugs.update(id, dto, user);
  }

  @Post(':id/transition')
  async transition(@Param('id') id: string, @Body() dto: TransitionBugDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.bugs.projectIdOf(id), user, 'bugs', 'edit');
    return this.bugs.transition(id, dto, user);
  }

  @Post(':id/duplicate')
  async markDuplicate(@Param('id') id: string, @Body() dto: MarkDuplicateBugDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.bugs.projectIdOf(id), user, 'bugs', 'edit');
    return this.bugs.markDuplicate(id, dto, user);
  }

  @Post(':id/comments')
  async addComment(@Param('id') id: string, @Body() dto: AddBugCommentDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.bugs.projectIdOf(id), user, 'bugs', 'edit');
    return this.bugs.addComment(id, dto, user);
  }

  @Post(':id/attachments')
  async addAttachment(@Param('id') id: string, @Body() dto: AddBugAttachmentDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.bugs.projectIdOf(id), user, 'bugs', 'edit');
    return this.bugs.addAttachment(id, dto, user);
  }

  @Post(':id/attachments/upload')
  async uploadAttachment(@Param('id') id: string, @Req() request: FastifyRequest, @CurrentUser() user: SessionUser) {
    const projectId = await this.bugs.projectIdOf(id);
    await this.projects.assertModuleAction(projectId, user, 'bugs', 'edit');
    const file = await request.file();
    if (!file) throw new BadRequestException('请选择上传文件');
    const asset = await this.uploads.save(file, projectId, user);
    return this.bugs.addAttachment(id, asset, user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.bugs.projectIdOf(id), user, 'bugs', 'delete');
    return this.bugs.remove(id);
  }
}
