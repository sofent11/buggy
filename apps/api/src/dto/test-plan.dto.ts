import { IsArray, IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import type { TestPlanStatus, TestRunStatus } from '@buggy/shared-types';

export class CreateTestPlanDto {
  @IsMongoId()
  projectId!: string;

  @IsOptional()
  @IsMongoId()
  iterationId?: string;

  @IsOptional()
  @IsMongoId()
  requirementId?: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  round?: string;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsArray()
  @IsMongoId({ each: true })
  caseIds!: string[];
}

export class UpdateTestPlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  round?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'done', 'archived'])
  status?: TestPlanStatus;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  caseIds?: string[];
}

export class UpdateRunItemDto {
  @IsIn(['untested', 'passed', 'failed', 'blocked', 'skipped'])
  status!: TestRunStatus;

  @IsOptional()
  @IsString()
  actualResult?: string;

  @IsOptional()
  @IsMongoId()
  executorId?: string;

  @IsOptional()
  stepResults?: Array<{ stepId?: string; status: TestRunStatus; actualResult?: string }>;
}

export class BatchUpdateRunItemsDto {
  @IsArray()
  @IsMongoId({ each: true })
  runItemIds!: string[];

  @IsIn(['untested', 'passed', 'failed', 'blocked', 'skipped'])
  status!: TestRunStatus;

  @IsOptional()
  @IsString()
  actualResult?: string;

  @IsOptional()
  @IsMongoId()
  executorId?: string;
}
