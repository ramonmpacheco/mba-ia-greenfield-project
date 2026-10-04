import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { Repository } from 'typeorm';
import { Video, VideoStatus } from './entities/video.entity';
import { VIDEO_JOB, VIDEO_QUEUE } from './video.constants';
import { VideoStorageService } from './video-storage.service';

const run = promisify(execFile);

interface ProbeResult {
  format?: { duration?: string; format_name?: string; bit_rate?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    duration?: string;
  }>;
}

@Processor(VIDEO_QUEUE, { concurrency: 1 })
export class VideoProcessor extends WorkerHost {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    private readonly storage: VideoStorageService,
  ) {
    super();
  }

  async process(job: Job<{ videoId: string }>): Promise<void> {
    if (job.name !== VIDEO_JOB) throw new Error(`Unknown job: ${job.name}`);
    const video = await this.videos.findOne({
      where: { id: job.data.videoId },
    });
    if (!video || video.status === VideoStatus.READY) return;
    if (video.status !== VideoStatus.PROCESSING) return;

    const dir = await mkdtemp(join(tmpdir(), 'streamtube-video-'));
    const source = join(dir, 'source');
    const thumbnail = join(dir, 'thumbnail.jpg');
    try {
      await pipeline(
        await this.storage.read(video.storage_key),
        createWriteStream(source),
      );
      const { stdout } = await run(
        'ffprobe',
        ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', source],
        { maxBuffer: 2 * 1024 * 1024 },
      );
      const probe = JSON.parse(stdout) as ProbeResult;
      const videoStream = probe.streams?.find(
        (stream) => stream.codec_type === 'video',
      );
      const duration = Number(probe.format?.duration ?? videoStream?.duration);
      if (!videoStream || !Number.isFinite(duration) || duration <= 0) {
        throw new Error('No valid video stream or duration');
      }

      await run('ffmpeg', [
        '-v',
        'error',
        '-ss',
        String(Math.min(1, duration / 2)),
        '-i',
        source,
        '-frames:v',
        '1',
        '-vf',
        'scale=320:-2',
        '-y',
        thumbnail,
      ]);
      const thumbnailKey = `videos/${video.id}/thumbnail.jpg`;
      await this.storage.putThumbnail(thumbnailKey, await readFile(thumbnail));
      await this.videos.update(
        { id: video.id, status: VideoStatus.PROCESSING },
        {
          status: VideoStatus.READY,
          thumbnail_key: thumbnailKey,
          duration_seconds: duration,
          metadata: {
            format: probe.format?.format_name ?? null,
            bitrate: probe.format?.bit_rate
              ? Number(probe.format.bit_rate)
              : null,
            codec: videoStream.codec_name ?? null,
            width: videoStream.width ?? null,
            height: videoStream.height ?? null,
          },
          error_message: null,
        },
      );
    } catch (error) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.videos.update(
          { id: video.id, status: VideoStatus.PROCESSING },
          {
            status: VideoStatus.ERROR,
            error_message:
              error instanceof Error
                ? error.message.slice(0, 500)
                : 'Processing failed',
          },
        );
      }
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
