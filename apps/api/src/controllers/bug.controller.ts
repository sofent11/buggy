import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CreateBugDto, CreateBugFromRunDto, UpdateBugDto } from '../dto/bug.dto.js';
import { ListQueryDto } from '../dto/common.dto.js';
import { BugService } from '../services/bug.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('bugs')
@UseGuards(AuthGuard)
export class BugController {
  constructor(private readonly bugs: BugService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.bugs.list(query);
  }

  @Post()
  create(@Body() dto: CreateBugDto, @CurrentUser() user: SessionUser) {
    return this.bugs.create(dto, user);
  }

  @Post('from-run')
  createFromRun(@Body() dto: CreateBugFromRunDto, @CurrentUser() user: SessionUser) {
    return this.bugs.createFromRun(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBugDto) {
    return this.bugs.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bugs.remove(id);
  }
}
