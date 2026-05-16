import { IsBoolean, IsIn, IsMongoId, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import type { SavedViewVisibility } from '@buggy/shared-types';

export class UpsertSavedViewDto {
  @IsMongoId()
  projectId!: string;

  @IsString()
  tab!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['private', 'project'])
  visibility?: SavedViewVisibility;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
