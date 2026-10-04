import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_PARTS } from '../video.constants';

export class CompletedPartDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PARTS)
  part_number: number;

  @IsString()
  @IsNotEmpty()
  etag: string;
}

export class CompleteVideoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PARTS)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts: CompletedPartDto[];
}
