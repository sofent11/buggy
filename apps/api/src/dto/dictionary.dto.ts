import { IsArray, IsBoolean, IsMongoId, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DictionaryValueDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsNumber()
  sort!: number;

  @IsBoolean()
  enabled!: boolean;
}

export class UpsertDictionaryDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DictionaryValueDto)
  values!: DictionaryValueDto[];
}
