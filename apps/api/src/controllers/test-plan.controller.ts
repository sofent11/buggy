import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { CreateTestPlanDto, UpdateRunItemDto, UpdateTestPlanDto } from '../dto/test-plan.dto.js';
import { TestPlanService } from '../services/test-plan.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('test-plans')
@UseGuards(AuthGuard)
export class TestPlanController {
  constructor(private readonly plans: TestPlanService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.plans.list(query);
  }

  @Post()
  create(@Body() dto: CreateTestPlanDto) {
    return this.plans.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.plans.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTestPlanDto) {
    return this.plans.update(id, dto);
  }

  @Patch(':id/run-items/:runItemId')
  updateRunItem(
    @Param('id') id: string,
    @Param('runItemId') runItemId: string,
    @Body() dto: UpdateRunItemDto,
    @CurrentUser() user: SessionUser
  ) {
    return this.plans.updateRunItem(id, runItemId, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
