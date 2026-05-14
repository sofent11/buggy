import { IsEmail, IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import type { ProjectRole } from '@buggy/shared-types';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpsertProjectMemberDto {
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsIn(['owner', 'tester', 'developer', 'viewer'])
  role!: ProjectRole;
}
