import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { CompleteVideoDto } from './dto/complete-video.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import { SignPartsDto } from './dto/sign-parts.dto';
import { Video, VideoStatus } from './entities/video.entity';
import { ByteRange, parseByteRange } from './range.util';
import {
  VideoNotFoundException,
  VideoRangeInvalidException,
} from './video.exceptions';
import { VideoStorageService } from './video-storage.service';
import { VideosService } from './videos.service';

function response(video: Video) {
  return {
    id: video.id,
    title: video.title,
    status: video.status,
    duration_seconds: video.duration_seconds,
    metadata: video.metadata,
    size_bytes: video.actual_size ? Number(video.actual_size) : null,
    created_at: video.created_at,
    stream_url:
      video.status === VideoStatus.READY ? `/videos/${video.id}/stream` : null,
    thumbnail_url:
      video.status === VideoStatus.READY
        ? `/videos/${video.id}/thumbnail`
        : null,
    download_url:
      video.status === VideoStatus.READY
        ? `/videos/${video.id}/download`
        : null,
  };
}

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly storage: VideoStorageService,
  ) {}

  @Post()
  @ApiBearerAuth('access-token')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVideoDto) {
    return this.videos.create(user.sub, dto);
  }

  @Post(':id/upload-parts')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  signParts(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignPartsDto,
  ) {
    return this.videos.signParts(user.sub, id, dto.part_numbers);
  }

  @Post(':id/complete')
  @HttpCode(202)
  @ApiBearerAuth('access-token')
  complete(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteVideoDto,
  ) {
    return this.videos.complete(user.sub, id, dto);
  }

  @Delete(':id/upload')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  abort(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.videos.abort(user.sub, id);
  }

  @Get(':id/status')
  @SkipThrottle()
  @ApiBearerAuth('access-token')
  async status(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.videos.status(user.sub, id));
  }

  @Public()
  @Get(':id')
  @SkipThrottle()
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return response(await this.videos.ready(id));
  }

  @Public()
  @Get(':id/stream')
  @SkipThrottle()
  async stream(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const video = await this.videos.ready(id);
    const size = Number(video.actual_size);
    let parsed: ByteRange | null;
    try {
      parsed = parseByteRange(range, size);
    } catch (error) {
      if (error instanceof VideoRangeInvalidException) {
        res.setHeader('Content-Range', `bytes */${size}`);
      }
      throw error;
    }
    const body = await this.storage.read(video.storage_key, parsed?.header);
    res.status(parsed ? 206 : 200);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', video.content_type);
    res.setHeader('Content-Length', String(parsed ? parsed.length : size));
    if (parsed) {
      res.setHeader(
        'Content-Range',
        `bytes ${parsed.start}-${parsed.end}/${size}`,
      );
    }
    await pipeline(body, res);
  }

  @Public()
  @Get(':id/download')
  @SkipThrottle()
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const video = await this.videos.ready(id);
    const filename = video.original_filename.replace(/["\\\r\n]/g, '_');
    const body = await this.storage.read(video.storage_key);
    res.status(200);
    res.setHeader('Content-Type', video.content_type);
    res.setHeader('Content-Length', video.actual_size!);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(video.original_filename)}`,
    );
    await pipeline(body, res);
  }

  @Public()
  @Get(':id/thumbnail')
  @SkipThrottle()
  async thumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const video = await this.videos.ready(id);
    if (!video.thumbnail_key) throw new VideoNotFoundException();
    const body = await this.storage.read(video.thumbnail_key);
    res.setHeader('Content-Type', 'image/jpeg');
    await pipeline(body, res);
  }
}
