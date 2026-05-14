import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { CreateTestCaseDto, UpdateTestCaseDto } from '../dto/test-case.dto.js';
import { TestCaseService } from '../services/test-case.service.js';
import { AuthGuard } from '../shared/auth.guard.js';

@Controller('test-cases')
@UseGuards(AuthGuard)
export class TestCaseController {
  constructor(private readonly cases: TestCaseService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.cases.list(query);
  }

  @Post()
  create(@Body() dto: CreateTestCaseDto) {
    return this.cases.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.cases.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTestCaseDto) {
    return this.cases.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cases.remove(id);
  }
}
