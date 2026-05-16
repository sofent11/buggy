import { IsArray, IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import type { Priority, RequirementAcceptanceStatus, RequirementStatus } from '@buggy/shared-types';

export class CreateRequirementDto {
  @IsMongoId()
  projectId!: string;

  @IsOptional()
  @IsMongoId()
  iterationId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsMongoId()
  riskOwnerId?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  riskNote?: string;

  @IsOptional()
  @IsIn(['draft', 'ready', 'testing', 'done', 'blocked'])
  status?: RequirementStatus;

  @IsOptional()
  @IsIn(['P0', 'P1', 'P2', 'P3'])
  priority?: Priority;

  @IsOptional()
  @IsIn(['not_ready', 'ready', 'approved', 'rejected'])
  acceptanceStatus?: RequirementAcceptanceStatus;

  @IsOptional()
  @IsMongoId()
  reviewerId?: string;

  @IsOptional()
  @IsString()
  larkWebhook?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class UpdateRequirementDto {
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @IsMongoId()
  iterationId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsMongoId()
  riskOwnerId?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  riskNote?: string;

  @IsOptional()
  @IsIn(['draft', 'ready', 'testing', 'done', 'blocked'])
  status?: RequirementStatus;

  @IsOptional()
  @IsIn(['P0', 'P1', 'P2', 'P3'])
  priority?: Priority;

  @IsOptional()
  @IsIn(['not_ready', 'ready', 'approved', 'rejected'])
  acceptanceStatus?: RequirementAcceptanceStatus;

  @IsOptional()
  @IsMongoId()
  reviewerId?: string;

  @IsOptional()
  @IsString()
  larkWebhook?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class BindLarkDto {
  @IsString()
  larkWebhook!: string;
}
