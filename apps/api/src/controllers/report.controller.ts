import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ListQueryDto } from '../dto/common.dto.js';
import { ReportService } from '../services/report.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { ProjectService } from '../services/project.service.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly projects: ProjectService
  ) {}

  @Get('summary')
  async summary(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.reports.summary(query);
  }

  @Get('html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async html(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.reports.html(query);
  }

  @Get('pdf')
  async pdf(@Query() query: ListQueryDto, @Res() reply: FastifyReply, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    const buffer = await this.reports.pdf(query);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'attachment; filename="buggy-report.pdf"')
      .send(buffer);
  }
}
