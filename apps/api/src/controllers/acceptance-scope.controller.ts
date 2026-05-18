import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CreateAcceptanceScopeDto, AddRiskWaiverDto, SignoffAcceptanceScopeDto, UpdateAcceptanceScopeDto } from '../dto/acceptance-scope.dto.js';
import { ListQueryDto } from '../dto/common.dto.js';
import { AcceptanceScopeService } from '../services/acceptance-scope.service.js';
import { ProjectService } from '../services/project.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('acceptance-scopes')
@UseGuards(AuthGuard)
export class AcceptanceScopeController {
  constructor(
    private readonly scopes: AcceptanceScopeService,
    private readonly projects: ProjectService
  ) {}

  @Get()
  async list(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.scopes.list(query);
  }

  @Post()
  async create(@Body() dto: CreateAcceptanceScopeDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(dto.projectId, user, 'reports', 'create');
    return this.scopes.create(dto, user);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.get(await this.scopes.projectIdOf(id), user);
    return this.scopes.get(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAcceptanceScopeDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.scopes.projectIdOf(id), user, 'reports', 'edit');
    return this.scopes.update(id, dto, user);
  }

  @Post(':id/waivers')
  async addWaiver(@Param('id') id: string, @Body() dto: AddRiskWaiverDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.scopes.projectIdOf(id), user, 'reports', 'edit');
    return this.scopes.addWaiver(id, dto, user);
  }

  @Post(':id/signoff')
  async signoff(@Param('id') id: string, @Body() dto: SignoffAcceptanceScopeDto, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.scopes.projectIdOf(id), user, 'reports', 'signoff');
    return this.scopes.signoff(id, dto, user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.projects.assertModuleAction(await this.scopes.projectIdOf(id), user, 'reports', 'delete');
    return this.scopes.remove(id);
  }
}
