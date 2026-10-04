import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';
import { MAX_PARTS } from '../video.constants';

export class SignPartsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PARTS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_PARTS, { each: true })
  part_numbers: number[];
}
