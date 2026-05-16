import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { BindLarkDto, CreateRequirementDto, UpdateRequirementDto } from '../dto/requirement.dto.js';
import { LarkService } from '../services/lark.service.js';
import { RequirementService } from '../services/requirement.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { ProjectService } from '../services/project.service.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('requirements')
@UseGuards(AuthGuard)
export class RequirementController {
  constructor(
    private readonly requirements: RequirementService,
    private readonly lark: LarkService,
    private readonly projects: ProjectService
  ) {}

  @Get()
  async list(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.requirements.list(query);
  }

  @Post()
  async create(@Body() dto: CreateRequirementDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertWrite(dto.projectId, user);
    return this.requirements.create(dto, user);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.get(await this.requirements.projectIdOf(id), user);
    return this.requirements.get(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateRequirementDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertWrite(await this.requirements.projectIdOf(id), user);
    return this.requirements.update(id, dto, user);
  }

  @Patch(':id/lark')
  async bindLark(@Param('id') id: string, @Body() dto: BindLarkDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertWrite(await this.requirements.projectIdOf(id), user);
    return this.requirements.bindLark(id, dto, user);
  }

  @Post(':id/lark/send')
  async sendLark(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.get(await this.requirements.projectIdOf(id), user);
    return this.lark.sendRequirementProgress(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.assertManage(await this.requirements.projectIdOf(id), user);
    return this.requirements.remove(id);
  }
}
