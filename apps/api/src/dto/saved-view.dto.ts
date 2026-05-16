import { IsMongoId, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

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
}
