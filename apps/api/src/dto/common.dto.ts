import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class ProjectScopedQueryDto {
  @IsMongoId()
  projectId!: string;
}

export class ListQueryDto {
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
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  keyword?: string;
}
