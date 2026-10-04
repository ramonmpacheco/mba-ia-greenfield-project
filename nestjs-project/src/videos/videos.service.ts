import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { CompleteVideoDto } from './dto/complete-video.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import { Video, VideoStatus } from './entities/video.entity';
import {
  MAX_PARTS,
  PART_SIZE,
  VIDEO_JOB,
  VIDEO_QUEUE,
} from './video.constants';
import {
  VideoInvalidPartException,
  VideoInvalidStateException,
  VideoNotFoundException,
  VideoUploadIncompleteException,
} from './video.exceptions';
import { VideoStorageService } from './video-storage.service';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly storage: VideoStorageService,
    @InjectQueue(VIDEO_QUEUE) private readonly queue: Queue,
  ) {}

  async create(userId: string, dto: CreateVideoDto) {
    const channel = await this.channels.findOne({ where: { user_id: userId } });
    if (!channel) throw new VideoNotFoundException();

    const id = randomUUID();
    const video = await this.videos.save(
      this.videos.create({
        id,
        channel_id: channel.id,
        title: dto.title,
        status: VideoStatus.DRAFT,
        storage_key: `videos/${id}/source`,
        thumbnail_key: null,
        upload_id: null,
        expected_size: String(dto.size_bytes),
        actual_size: null,
        content_type: dto.content_type,
        original_filename: dto.filename,
        duration_seconds: null,
        metadata: null,
        error_message: null,
      }),
    );

    try {
      video.upload_id = await this.storage.startMultipart(
        video.storage_key,
        video.content_type,
      );
      await this.videos.save(video);
    } catch (error) {
      await this.videos.update(video.id, {
        status: VideoStatus.ERROR,
        error_message: 'Could not start upload',
      });
      throw error;
    }

    return {
      id: video.id,
      status: video.status,
      part_size: PART_SIZE,
      part_count: Math.ceil(dto.size_bytes / PART_SIZE),
    };
  }

  private async owned(userId: string, id: string): Promise<Video> {
    const video = await this.videos.findOne({
      where: { id, channel: { user_id: userId } },
    });
    if (!video) throw new VideoNotFoundException();
    return video;
  }

  private async ownedDraft(userId: string, id: string): Promise<Video> {
    const video = await this.owned(userId, id);
    if (video.status !== VideoStatus.DRAFT || !video.upload_id) {
      throw new VideoInvalidStateException();
    }
    return video;
  }

  async signParts(userId: string, id: string, partNumbers: number[]) {
    const video = await this.ownedDraft(userId, id);
    const count = Math.ceil(Number(video.expected_size) / PART_SIZE);
    if (
      partNumbers.length > MAX_PARTS ||
      new Set(partNumbers).size !== partNumbers.length ||
      partNumbers.some((part) => part < 1 || part > count)
    ) {
      throw new VideoInvalidPartException();
    }
    const parts = await Promise.all(
      partNumbers.map(async (part_number) => ({
        part_number,
        url: await this.storage.signPart(
          video.storage_key,
          video.upload_id!,
          part_number,
        ),
      })),
    );
    return { parts };
  }

  async complete(userId: string, id: string, dto: CompleteVideoDto) {
    const video = await this.ownedDraft(userId, id);
    const count = Math.ceil(Number(video.expected_size) / PART_SIZE);
    const ordered = [...dto.parts].sort(
      (a, b) => a.part_number - b.part_number,
    );
    if (
      ordered.length !== count ||
      ordered.some((part, index) => part.part_number !== index + 1)
    ) {
      throw new VideoInvalidPartException();
    }

    const uploaded = await this.storage.uploadedParts(
      video.storage_key,
      video.upload_id!,
    );
    if (
      uploaded.length !== count ||
      uploaded.some(
        (part, index) =>
          part.PartNumber !== index + 1 ||
          part.ETag !== ordered[index].etag ||
          part.Size !==
            Math.min(
              PART_SIZE,
              Number(video.expected_size) - index * PART_SIZE,
            ),
      )
    ) {
      throw new VideoUploadIncompleteException();
    }

    await this.storage.completeMultipart(
      video.storage_key,
      video.upload_id!,
      ordered,
    );
    const size = await this.storage.size(video.storage_key);
    if (size !== Number(video.expected_size)) {
      await this.videos.update(video.id, {
        status: VideoStatus.ERROR,
        error_message: 'Uploaded size mismatch',
      });
      throw new VideoUploadIncompleteException();
    }

    await this.videos.update(
      { id: video.id, status: VideoStatus.DRAFT },
      {
        status: VideoStatus.PROCESSING,
        upload_id: null,
        actual_size: String(size),
      },
    );
    try {
      await this.queue.add(
        VIDEO_JOB,
        { videoId: video.id },
        {
          jobId: video.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 86400 },
          removeOnFail: false,
        },
      );
    } catch (error) {
      await this.videos.update(video.id, {
        status: VideoStatus.ERROR,
        error_message: 'Could not enqueue processing',
      });
      throw error;
    }
    return { id: video.id, status: VideoStatus.PROCESSING };
  }

  async abort(userId: string, id: string): Promise<void> {
    const video = await this.ownedDraft(userId, id);
    await this.storage.abortMultipart(video.storage_key, video.upload_id!);
    await this.videos.update(id, {
      status: VideoStatus.ERROR,
      upload_id: null,
      error_message: 'Upload aborted',
    });
  }

  async status(userId: string, id: string): Promise<Video> {
    return this.owned(userId, id);
  }

  async ready(id: string): Promise<Video> {
    const video = await this.videos.findOne({
      where: { id, status: VideoStatus.READY },
    });
    if (!video) throw new VideoNotFoundException();
    return video;
  }
}
