import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { CreateTestCaseDto, UpdateTestCaseDto } from '../dto/test-case.dto.js';
import { TestCaseService } from '../services/test-case.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { ProjectService } from '../services/project.service.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('test-cases')
@UseGuards(AuthGuard)
export class TestCaseController {
  constructor(
    private readonly cases: TestCaseService,
    private readonly projects: ProjectService
  ) {}

  @Get()
  async list(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.cases.list(query);
  }

  @Post()
  async create(@Body() dto: CreateTestCaseDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(dto.projectId, user, 'cases', 'create');
    return this.cases.create(dto, user);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.get(await this.cases.projectIdOf(id), user);
    return this.cases.get(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTestCaseDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.cases.projectIdOf(id), user, 'cases', 'edit');
    return this.cases.update(id, dto, user);
  }

  @Post(':id/restore-baseline')
  async restoreBaseline(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.cases.projectIdOf(id), user, 'cases', 'edit');
    return this.cases.restoreBaseline(id, user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.cases.projectIdOf(id), user, 'cases', 'delete');
    return this.cases.remove(id);
  }
}
