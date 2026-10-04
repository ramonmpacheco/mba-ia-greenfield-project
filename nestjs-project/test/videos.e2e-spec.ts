import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Channel } from '../src/channels/entities/channel.entity';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { User } from '../src/users/entities/user.entity';

const run = promisify(execFile);

function putSignedPart(signedUrl: string, body: Buffer): Promise<string> {
  const url = new URL(signedUrl);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: 'minio',
        port: 9000,
        path: `${url.pathname}${url.search}`,
        method: 'PUT',
        headers: { Host: url.host, 'Content-Length': body.length },
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          if (res.statusCode !== 200 || !res.headers.etag) {
            reject(new Error(`Part upload failed: ${res.statusCode}`));
          } else {
            resolve(res.headers.etag);
          }
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

describe('Videos (e2e with MinIO, Redis and worker)', () => {
  let app: INestApplication<App>;
  let db: DataSource;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();
    db = module.get(DataSource);
    await cleanAllTables(db);
  });

  afterAll(async () => {
    await app.close();
  });

  it('uploads directly, processes, streams a range and downloads', async () => {
    const id = randomUUID();
    const email = `${id}@example.com`;
    await db
      .getRepository(User)
      .save({ id, email, password: 'unused', is_confirmed: true });
    await db.getRepository(Channel).save({
      id: randomUUID(),
      user_id: id,
      name: 'videos',
      nickname: `user_${id.slice(0, 8)}`,
    });
    const token = await app.get(JwtService).signAsync({ sub: id, email });
    const dir = await mkdtemp(join(tmpdir(), 'streamtube-e2e-'));
    try {
      const file = join(dir, 'video.mp4');
      await run('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=160x90:rate=10',
        '-t',
        '2',
        '-c:v',
        'mpeg4',
        '-y',
        file,
      ]);
      const bytes = await readFile(file);
      const created = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test video',
          filename: 'video.mp4',
          content_type: 'video/mp4',
          size_bytes: bytes.length,
        })
        .expect(201);
      expect(created.body.status).toBe('draft');
      expect(created.body.part_count).toBe(1);
      const videoId = created.body.id as string;

      const signed = await request(app.getHttpServer())
        .post(`/videos/${videoId}/upload-parts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ part_numbers: [1] })
        .expect(200);
      const etag = await putSignedPart(
        signed.body.parts[0].url as string,
        bytes,
      );
      await request(app.getHttpServer())
        .post(`/videos/${videoId}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parts: [{ part_number: 1, etag }] })
        .expect(202);

      let state = 'processing';
      for (let attempt = 0; attempt < 60 && state === 'processing'; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const result = await request(app.getHttpServer())
          .get(`/videos/${videoId}/status`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        state = result.body.status as string;
      }
      expect(state).toBe('ready');
      const range = await request(app.getHttpServer())
        .get(`/videos/${videoId}/stream`)
        .set('Range', 'bytes=0-99')
        .expect(206);
      expect(range.headers['content-range']).toBe(`bytes 0-99/${bytes.length}`);
      expect(range.body).toHaveLength(100);
      await request(app.getHttpServer())
        .get(`/videos/${videoId}/download`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/videos/${videoId}/thumbnail`)
        .expect(200);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('accepts a 10 GB multipart session without receiving the file', async () => {
    const userId = randomUUID();
    const email = `${userId}@example.com`;
    await db.getRepository(User).save({
      id: userId,
      email,
      password: 'unused',
      is_confirmed: true,
    });
    await db.getRepository(Channel).save({
      id: randomUUID(),
      user_id: userId,
      name: 'large videos',
      nickname: `large_${userId.slice(0, 8)}`,
    });
    const token = await app.get(JwtService).signAsync({ sub: userId, email });
    const created = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Large video',
        filename: 'large.mp4',
        content_type: 'video/mp4',
        size_bytes: 10_000_000_000,
      })
      .expect(201);
    expect(created.body.status).toBe('draft');
    expect(created.body.part_count).toBe(150);
    await request(app.getHttpServer())
      .post(`/videos/${created.body.id}/upload-parts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ part_numbers: [150] })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/videos/${created.body.id}/upload`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });
});
