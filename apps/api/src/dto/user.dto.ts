import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { SystemPermission, SystemRole, UserStatus } from '@buggy/shared-types';

export class UserListQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsIn(['admin', 'maintainer', 'user', 'project_owner', 'tester', 'developer', 'viewer'])
  role?: SystemRole;

  @IsOptional()
  @IsIn(['admin', 'maintainer', 'user'])
  systemPermission?: SystemPermission;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: UserStatus;
}

export class UpdateUserDto {
  @IsOptional()
  @IsIn(['admin', 'maintainer', 'user', 'project_owner', 'tester', 'developer', 'viewer'])
  role?: SystemRole;

  @IsOptional()
  @IsIn(['admin', 'maintainer', 'user'])
  systemPermission?: SystemPermission;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: UserStatus;
}
