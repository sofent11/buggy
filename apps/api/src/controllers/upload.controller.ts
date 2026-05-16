import { BadRequestException, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UploadService } from '../services/upload.service.js';
import { ProjectService } from '../services/project.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('uploads')
@UseGuards(AuthGuard)
export class UploadController {
  constructor(
    private readonly uploads: UploadService,
    private readonly projects: ProjectService
  ) {}

  @Post()
  async upload(@Query('projectId') projectId: string | undefined, @Req() request: FastifyRequest, @CurrentUser() user: SessionUser) {
    if (projectId) await this.projects.get(projectId, user);
    const file = await request.file();
    if (!file) throw new BadRequestException('请选择上传文件');
    return this.uploads.save(file, projectId, user);
  }

  @Get(':id/:name')
  async download(@Param('id') id: string, @Param('name') name: string, @Res() reply: FastifyReply) {
    const file = await this.uploads.read(id, name);
    reply
      .header('Content-Type', file.mimeType)
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`)
      .send(file.buffer);
  }
}
