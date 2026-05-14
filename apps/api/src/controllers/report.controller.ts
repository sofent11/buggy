import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { ReportService } from '../services/report.service.js';
import { AuthGuard } from '../shared/auth.guard.js';

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get('summary')
  summary(@Query() query: ListQueryDto) {
    return this.reports.summary(query);
  }

  @Get('html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  html(@Query() query: ListQueryDto) {
    return this.reports.html(query);
  }
}
