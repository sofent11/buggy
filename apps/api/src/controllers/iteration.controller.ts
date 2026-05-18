import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { CreateIterationDto, UpdateIterationDto } from '../dto/iteration.dto.js';
import { IterationService } from '../services/iteration.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { ProjectService } from '../services/project.service.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('iterations')
@UseGuards(AuthGuard)
export class IterationController {
  constructor(
    private readonly iterations: IterationService,
    private readonly projects: ProjectService
  ) {}

  @Get()
  async list(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.iterations.list(query);
  }

  @Post()
  async create(@Body() dto: CreateIterationDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(dto.projectId, user, 'iterations', 'create');
    return this.iterations.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateIterationDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.iterations.projectIdOf(id), user, 'iterations', 'edit');
    return this.iterations.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.iterations.projectIdOf(id), user, 'iterations', 'delete');
    return this.iterations.remove(id);
  }
}
