import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { CreateTestPlanDto, UpdateRunItemDto, UpdateTestPlanDto } from '../dto/test-plan.dto.js';
import { TestPlanService } from '../services/test-plan.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';
import { ProjectService } from '../services/project.service.js';

@Controller('test-plans')
@UseGuards(AuthGuard)
export class TestPlanController {
  constructor(
    private readonly plans: TestPlanService,
    private readonly projects: ProjectService
  ) {}

  @Get()
  async list(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.plans.list(query);
  }

  @Post()
  async create(@Body() dto: CreateTestPlanDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertWrite(dto.projectId, user);
    return this.plans.create(dto, user);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.get(await this.plans.projectIdOf(id), user);
    return this.plans.get(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTestPlanDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertWrite(await this.plans.projectIdOf(id), user);
    return this.plans.update(id, dto, user);
  }

  @Patch(':id/run-items/:runItemId')
  async updateRunItem(
    @Param('id') id: string,
    @Param('runItemId') runItemId: string,
    @Body() dto: UpdateRunItemDto,
    @CurrentUser() user: SessionUser
  ) {
    await this.projects.assertRole(await this.plans.projectIdOf(id), user, ['owner', 'tester']);
    return this.plans.updateRunItem(id, runItemId, dto, user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.assertManage(await this.plans.projectIdOf(id), user);
    return this.plans.remove(id);
  }
}
