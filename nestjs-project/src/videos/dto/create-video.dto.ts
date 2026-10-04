import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_VIDEO_BYTES } from '../video.constants';

export class CreateVideoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsString()
  @Matches(/^video\/[a-z0-9.+-]+$/i)
  @MaxLength(255)
  content_type: string;

  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_BYTES)
  size_bytes: number;
}
