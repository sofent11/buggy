import { IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import type { BugStatus, Priority, Severity } from '@buggy/shared-types';

export class CreateBugDto {
  @IsMongoId()
  projectId!: string;

  @IsOptional()
  @IsMongoId()
  iterationId?: string;

  @IsOptional()
  @IsMongoId()
  requirementId?: string;

  @IsOptional()
  @IsMongoId()
  testCaseId?: string;

  @IsOptional()
  @IsMongoId()
  testPlanId?: string;

  @IsOptional()
  @IsMongoId()
  runItemId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  reproduceSteps?: string;

  @IsOptional()
  @IsString()
  expectedResult?: string;

  @IsOptional()
  @IsString()
  actualResult?: string;

  @IsOptional()
  @IsIn(['S0', 'S1', 'S2', 'S3'])
  severity?: Severity;

  @IsOptional()
  @IsIn(['P0', 'P1', 'P2', 'P3'])
  priority?: Priority;

  @IsOptional()
  @IsIn(['open', 'in_progress', 'resolved', 'verified', 'closed', 'reopened'])
  status?: BugStatus;

  @IsOptional()
  @IsMongoId()
  assigneeId?: string;

  @IsOptional()
  @IsMongoId()
  duplicateOfId?: string;
}

export class UpdateBugDto {
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
  testCaseId?: string;

  @IsOptional()
  @IsMongoId()
  testPlanId?: string;

  @IsOptional()
  @IsMongoId()
  runItemId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  reproduceSteps?: string;

  @IsOptional()
  @IsString()
  expectedResult?: string;

  @IsOptional()
  @IsString()
  actualResult?: string;

  @IsOptional()
  @IsIn(['S0', 'S1', 'S2', 'S3'])
  severity?: Severity;

  @IsOptional()
  @IsIn(['P0', 'P1', 'P2', 'P3'])
  priority?: Priority;

  @IsOptional()
  @IsIn(['open', 'in_progress', 'resolved', 'verified', 'closed', 'reopened'])
  status?: BugStatus;

  @IsOptional()
  @IsMongoId()
  assigneeId?: string;

  @IsOptional()
  @IsMongoId()
  duplicateOfId?: string;
}

export class CreateBugFromRunDto {
  @IsMongoId()
  testPlanId!: string;

  @IsMongoId()
  runItemId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  actualResult?: string;

  @IsOptional()
  @IsString()
  reproduceSteps?: string;

  @IsOptional()
  @IsIn(['S0', 'S1', 'S2', 'S3'])
  severity?: Severity;

  @IsOptional()
  @IsIn(['P0', 'P1', 'P2', 'P3'])
  priority?: Priority;

  @IsOptional()
  @IsMongoId()
  assigneeId?: string;
}

export class AddBugCommentDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

export class AddBugAttachmentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  url!: string;
}
