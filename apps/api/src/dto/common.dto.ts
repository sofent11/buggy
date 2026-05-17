import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';

export class ProjectScopedQueryDto {
  @IsMongoId()
  projectId!: string;
}

export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number = 50;

  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @IsMongoId()
  iterationId?: string;

  @IsOptional()
  @IsMongoId()
  requirementId?: string;

  @IsOptional()
  @IsMongoId()
  testPlanId?: string;

  @IsOptional()
  @IsMongoId()
  acceptanceScopeId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  triageStatus?: string;

  @IsOptional()
  @IsString()
  reviewStatus?: string;

  @IsOptional()
  @IsString()
  automationStatus?: string;

  @IsOptional()
  @IsMongoId()
  assigneeId?: string;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  suiteId?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
