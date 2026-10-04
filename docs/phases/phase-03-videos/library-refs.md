---
kind: library-cache
name: phase-03-videos
lookup: official-documentation-fallback
context7: unavailable-in-current-session
---

# Library References

Context7 não estava exposto entre as ferramentas desta sessão. As APIs abaixo foram conferidas na documentação oficial; a configuração Codex do MCP consta em `.codex/config.toml` para sessões futuras.

## @nestjs/bullmq / bullmq

- [NestJS Queues](https://docs.nestjs.com/techniques/queues): `BullModule.forRoot`, `registerQueue`, `@InjectQueue`, `@Processor`, `WorkerHost` e producer/consumer separados.
- [BullMQ retry](https://docs.bullmq.io/guide/retrying-failing-jobs): `attempts` e `backoff`.

## @aws-sdk/client-s3 / @aws-sdk/s3-request-presigner

- [AWS SDK v3 S3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html): `S3Client`, comandos e `getSignedUrl` no pacote presigner; `GetObject` retorna stream.
- [Multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html): 5 MiB–5 GiB por parte, até 10.000 partes.
- [S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html): `Range`, `206` e `Content-Range`.

## FFmpeg / ffprobe

- [ffprobe](https://ffmpeg.org/ffprobe.html): saída JSON de formato e streams.
- [FFmpeg image2](https://www.ffmpeg.org/ffmpeg-formats.html): `-frames:v 1` gera frame único.
