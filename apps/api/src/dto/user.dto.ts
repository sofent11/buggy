import { IsIn, IsOptional, IsString } from 'class-validator';
import type { SystemRole, UserStatus } from '@buggy/shared-types';

export class UserListQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsIn(['admin', 'project_owner', 'tester', 'developer', 'viewer'])
  role?: SystemRole;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: UserStatus;
}
