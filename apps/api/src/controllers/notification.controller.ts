import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ListQueryDto } from '../dto/common.dto.js';
import { NotificationService } from '../services/notification.service.js';
import { ProjectService } from '../services/project.service.js';
import { AuthGuard } from '../shared/auth.guard.js';
import { CurrentUser } from '../shared/current-user.decorator.js';
import type { SessionUser } from '../services/auth.service.js';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly projects: ProjectService
  ) {}

  @Get()
  async list(@Query() query: ListQueryDto, @CurrentUser() user: SessionUser) {
    if (query.projectId) await this.projects.get(query.projectId, user);
    return this.notifications.list(user, query);
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.notifications.markRead(id, user);
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: SessionUser) {
    return this.notifications.markAllRead(user);
  }
}
