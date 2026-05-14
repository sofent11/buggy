import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { CreateIterationDto, UpdateIterationDto } from '../dto/iteration.dto.js';
import { IterationService } from '../services/iteration.service.js';
import { AuthGuard } from '../shared/auth.guard.js';

@Controller('iterations')
@UseGuards(AuthGuard)
export class IterationController {
  constructor(private readonly iterations: IterationService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.iterations.list(query);
  }

  @Post()
  create(@Body() dto: CreateIterationDto) {
    return this.iterations.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIterationDto) {
    return this.iterations.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.iterations.remove(id);
  }
}
