import { IsDateString, IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import type { IterationStatus } from '@buggy/shared-types';

export class CreateIterationDto {
  @IsMongoId()
  projectId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['planning', 'active', 'done', 'archived'])
  status?: IterationStatus;
}

export class UpdateIterationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['planning', 'active', 'done', 'archived'])
  status?: IterationStatus;
}
