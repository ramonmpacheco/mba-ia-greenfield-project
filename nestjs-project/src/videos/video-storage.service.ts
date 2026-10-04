import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

@Injectable()
export class VideoStorageService {
  private readonly internal: S3Client;
  private readonly publicClient: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const common = {
      region: config.getOrThrow<string>('S3_REGION'),
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
      },
    };
    this.internal = new S3Client({
      ...common,
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
    });
    this.publicClient = new S3Client({
      ...common,
      endpoint: config.getOrThrow<string>('S3_PUBLIC_ENDPOINT'),
    });
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
  }

  async startMultipart(key: string, contentType: string): Promise<string> {
    const result = await this.internal.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!result.UploadId) throw new Error('Storage returned no upload ID');
    return result.UploadId;
  }

  async signPart(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 900 },
    );
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: { part_number: number; etag: string }[],
  ): Promise<void> {
    await this.internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            PartNumber: part.part_number,
            ETag: part.etag,
          })),
        },
      }),
    );
  }

  async uploadedParts(key: string, uploadId: string) {
    const result = await this.internal.send(
      new ListPartsCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MaxParts: 1000,
      }),
    );
    return result.Parts ?? [];
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    await this.internal.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  async size(key: string): Promise<number> {
    const result = await this.internal.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (result.ContentLength === undefined)
      throw new Error('Missing object length');
    return result.ContentLength;
  }

  async read(key: string, range?: string): Promise<Readable> {
    const result = await this.internal.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range }),
    );
    if (!result.Body) throw new Error('Storage returned no body');
    return result.Body as Readable;
  }

  async putThumbnail(key: string, body: Buffer): Promise<void> {
    await this.internal.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: 'image/jpeg',
      }),
    );
  }
}
