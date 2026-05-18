import { Type } from 'class-transformer';
import { IsArray, IsIn, IsMongoId, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import type { BugStatus, BugTeam, BugTriageStatus, Priority, Severity } from '@buggy/shared-types';

const bugTeams = ['web', 'android', 'ios', 'development', 'product', 'design', 'qa', 'operations', 'pm', 'other'] as const;
const bugTeamValues = [...bugTeams, ''] as const;

export class AddBugAttachmentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  url!: string;

  @IsOptional()
  size?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

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
  @IsIn(bugTeamValues)
  team?: BugTeam;

  @IsOptional()
  @IsMongoId()
  duplicateOfId?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  foundVersion?: string;

  @IsOptional()
  @IsString()
  fixVersion?: string;

  @IsOptional()
  @IsString()
  rootCause?: string;

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsOptional()
  @IsString()
  verifyResult?: string;

  @IsOptional()
  @IsIn(['critical', 'high', 'normal', 'low'])
  slaLevel?: 'critical' | 'high' | 'normal' | 'low';

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  watcherIds?: string[];

  @IsOptional()
  @IsIn(['new', 'triaged', 'needs_info', 'duplicate', 'accepted'])
  triageStatus?: BugTriageStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddBugAttachmentDto)
  attachments?: AddBugAttachmentDto[];
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
  @IsIn(bugTeamValues)
  team?: BugTeam;

  @IsOptional()
  @IsMongoId()
  duplicateOfId?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  foundVersion?: string;

  @IsOptional()
  @IsString()
  fixVersion?: string;

  @IsOptional()
  @IsString()
  rootCause?: string;

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsOptional()
  @IsString()
  verifyResult?: string;

  @IsOptional()
  @IsIn(['critical', 'high', 'normal', 'low'])
  slaLevel?: 'critical' | 'high' | 'normal' | 'low';

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  watcherIds?: string[];

  @IsOptional()
  @IsIn(['new', 'triaged', 'needs_info', 'duplicate', 'accepted'])
  triageStatus?: BugTriageStatus;

  @IsOptional()
  @IsString()
  statusReason?: string;
}

export class TransitionBugDto {
  @IsIn(['open', 'in_progress', 'resolved', 'verified', 'closed', 'reopened'])
  nextStatus!: BugStatus;

  @IsString()
  @MinLength(2)
  reason!: string;

  @IsOptional()
  @IsMongoId()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsOptional()
  @IsString()
  verifyResult?: string;
}

export class MarkDuplicateBugDto {
  @IsMongoId()
  duplicateOfId!: string;

  @IsString()
  @MinLength(2)
  reason!: string;
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

  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  foundVersion?: string;
}

export class AddBugCommentDto {
  @IsString()
  @MinLength(1)
  body!: string;
}
