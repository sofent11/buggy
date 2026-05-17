import { IsArray, IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import type { AcceptanceScope } from '@buggy/shared-types';

export class CreateAcceptanceScopeDto {
  @IsMongoId()
  projectId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsString()
  targetDate?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  iterationIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  requirementIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  testPlanIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  bugIds?: string[];

  @IsOptional()
  @IsArray()
  qualityGateRules?: AcceptanceScope['qualityGateRules'];
}

export class UpdateAcceptanceScopeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'reviewing', 'signed', 'rejected', 'archived'])
  status?: AcceptanceScope['status'];

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsString()
  targetDate?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  iterationIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  requirementIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  testPlanIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  bugIds?: string[];

  @IsOptional()
  @IsArray()
  qualityGateRules?: AcceptanceScope['qualityGateRules'];
}

export class AddRiskWaiverDto {
  @IsIn(['requirement', 'test_case', 'run_item', 'bug', 'quality_gate'])
  targetType!: 'requirement' | 'test_case' | 'run_item' | 'bug' | 'quality_gate';

  @IsOptional()
  @IsMongoId()
  targetId?: string;

  @IsString()
  @MinLength(2)
  reason!: string;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class SignoffAcceptanceScopeDto {
  @IsIn(['signed', 'rejected'])
  status!: 'signed' | 'rejected';

  @IsString()
  @MinLength(2)
  note!: string;
}
