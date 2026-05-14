import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { BindLarkDto, CreateRequirementDto, UpdateRequirementDto } from '../dto/requirement.dto.js';
import { LarkService } from '../services/lark.service.js';
import { RequirementService } from '../services/requirement.service.js';
import { AuthGuard } from '../shared/auth.guard.js';

@Controller('requirements')
@UseGuards(AuthGuard)
export class RequirementController {
  constructor(
    private readonly requirements: RequirementService,
    private readonly lark: LarkService
  ) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.requirements.list(query);
  }

  @Post()
  create(@Body() dto: CreateRequirementDto) {
    return this.requirements.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.requirements.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRequirementDto) {
    return this.requirements.update(id, dto);
  }

  @Patch(':id/lark')
  bindLark(@Param('id') id: string, @Body() dto: BindLarkDto) {
    return this.requirements.bindLark(id, dto);
  }

  @Post(':id/lark/send')
  sendLark(@Param('id') id: string) {
    return this.lark.sendRequirementProgress(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.requirements.remove(id);
  }
}
