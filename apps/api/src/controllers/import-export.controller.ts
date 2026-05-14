import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ImportRowsDto } from '../dto/import-export.dto.js';
import { ImportExportService } from '../services/import-export.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('import-export')
@UseGuards(AuthGuard)
export class ImportExportController {
  constructor(private readonly importExport: ImportExportService) {}

  @Get('template')
  async template(@Query('type') type: ImportRowsDto['type'], @Res() reply: FastifyReply) {
    const buffer = await this.importExport.template(type);
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${type}-template.xlsx"`)
      .send(buffer);
  }

  @Get('export')
  async export(@Query('type') type: ImportRowsDto['type'], @Query('projectId') projectId: string, @Res() reply: FastifyReply) {
    const buffer = await this.importExport.export(type, projectId);
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${type}.xlsx"`)
      .send(buffer);
  }

  @Post('import')
  importRows(@Body() dto: ImportRowsDto, @CurrentUser() user: SessionUser) {
    return this.importExport.importRows(dto, user);
  }

  @Post('import-xlsx')
  async importXlsx(@Query('projectId') projectId: string, @Query('type') type: ImportRowsDto['type'], @Req() request: FastifyRequest, @CurrentUser() user: SessionUser) {
    const file = await request.file();
    if (!file) return { imported: 0, errors: [{ row: 0, message: '请选择 Excel 文件' }] };
    const buffer = await file.toBuffer();
    return this.importExport.importWorkbook(projectId, type, buffer, user);
  }
}
