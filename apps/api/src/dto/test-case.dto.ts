import { Type } from 'class-transformer';
import { IsArray, IsIn, IsMongoId, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import type { Priority, TestCaseAutomationStatus, TestCaseReviewStatus, TestCaseStatus } from '@buggy/shared-types';

export class TestCaseStepDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  action!: string;

  @IsString()
  expected!: string;

  @IsOptional()
  sort?: number;
}

export class CreateTestCaseDto {
  @IsMongoId()
  projectId!: string;

  @IsOptional()
  @IsMongoId()
  requirementId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  preconditions?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseStepDto)
  steps?: TestCaseStepDto[];

  @IsOptional()
  @IsString()
  expectedResult?: string;

  @IsOptional()
  @IsIn(['P0', 'P1', 'P2', 'P3'])
  priority?: Priority;

  @IsOptional()
  @IsIn(['draft', 'ready', 'deprecated'])
  status?: TestCaseStatus;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  suiteId?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsIn(['draft', 'in_review', 'approved', 'changes_requested'])
  reviewStatus?: TestCaseReviewStatus;

  @IsOptional()
  @IsIn(['manual', 'candidate', 'automated'])
  automationStatus?: TestCaseAutomationStatus;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsMongoId()
  reviewerId?: string;

  @IsOptional()
  @IsString()
  reviewedAt?: string;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsString()
  baselineVersion?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class UpdateTestCaseDto {
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @IsMongoId()
  requirementId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  preconditions?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseStepDto)
  steps?: TestCaseStepDto[];

  @IsOptional()
  @IsString()
  expectedResult?: string;

  @IsOptional()
  @IsIn(['P0', 'P1', 'P2', 'P3'])
  priority?: Priority;

  @IsOptional()
  @IsIn(['draft', 'ready', 'deprecated'])
  status?: TestCaseStatus;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  suiteId?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsIn(['draft', 'in_review', 'approved', 'changes_requested'])
  reviewStatus?: TestCaseReviewStatus;

  @IsOptional()
  @IsIn(['manual', 'candidate', 'automated'])
  automationStatus?: TestCaseAutomationStatus;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsMongoId()
  reviewerId?: string;

  @IsOptional()
  @IsString()
  reviewedAt?: string;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsString()
  baselineVersion?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}
