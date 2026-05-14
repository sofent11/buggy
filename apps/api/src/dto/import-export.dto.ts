import { IsArray, IsIn, IsMongoId } from 'class-validator';

export class ImportRowsDto {
  @IsMongoId()
  projectId!: string;

  @IsIn(['requirements', 'test-cases', 'bugs', 'run-results'])
  type!: 'requirements' | 'test-cases' | 'bugs' | 'run-results';

  @IsArray()
  rows!: Array<Record<string, unknown>>;
}
