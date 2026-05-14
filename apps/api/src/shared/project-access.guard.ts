import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ProjectService } from '../services/project.service.js';
import type { SessionUser } from '../services/auth.service.js';

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(private readonly projectService: ProjectService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user: SessionUser;
      params: Record<string, string>;
      query: Record<string, string>;
      body: Record<string, unknown>;
    }>();
    const projectId =
      request.params.projectId ||
      request.params.id ||
      request.query.projectId ||
      (typeof request.body?.projectId === 'string' ? request.body.projectId : undefined);
    if (!projectId) return true;
    const canAccess = await this.projectService.canAccess(projectId, request.user);
    if (!canAccess) throw new ForbiddenException('无项目访问权限');
    return true;
  }
}
