---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-10-04
scope_description: "Backend de upload multipart, processamento assíncrono, thumbnail e entrega de vídeos da Fase 03."
---

# Technical Decisions — Phase 03: Vídeos

Escopo: `nestjs-project/`, infraestrutura no seu `compose.yaml`. O storage S3 compatível já é uma restrição do plano e do diagrama; MinIO é sua implementação local.

## TD-01: Fila de processamento

**Capability:** Serviço de processamento em segundo plano (filas)

**Options:** BullMQ com Redis oferece persistência, retry, idempotência por `jobId` e integração oficial NestJS; RabbitMQ oferece roteamento e acknowledgements robustos, porém adiciona mais configuração para uma única fila; tabela de jobs em PostgreSQL economiza um serviço, mas exigiria implementar locking, retry e polling.

**Recommendation / Decision:** BullMQ + Redis, com producer na API e consumer exclusivamente no container worker. Jobs levam apenas `videoId`; o banco mantém o estado de negócio. Três tentativas com backoff exponencial; erro terminal no banco. Redis usa volume persistente e AOF. [NestJS Queues](https://docs.nestjs.com/techniques/queues).

**Libraries:** `@nestjs/bullmq`, `bullmq`.

## TD-02: Upload de até 10 GB

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance; pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Options:** Multipart/form-data passando pela API aumenta tráfego, conexões longas e risco de buffer; protocolo tus exige serviço/protocolo extra; multipart S3 com `UploadPart` pré-assinado envia as partes diretamente do cliente ao storage e permite retomada por parte.

**Recommendation / Decision:** Criar o rascunho e a sessão multipart na API; assinar sob demanda URLs de partes de 64 MiB; cliente envia diretamente ao MinIO; API conclui a sessão com ETags, confere `HeadObject` e só então enfileira. Limite de 10.000.000.000 bytes, no máximo 150 partes. Nunca receber bytes do vídeo pela API. Bucket privado e chaves `videos/{uuid}/source`, `videos/{uuid}/thumbnail.jpg`. URLs expiram em 15 minutos, podendo ser renovadas. URLs externas usam endpoint público configurável; comunicação entre containers usa nome de serviço. [S3 multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html), [AWS SDK v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html).

**Libraries:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

## TD-03: Worker e mídia

**Capability:** Processamento automático do vídeo após upload (extração de duração e metadados); geração automática de thumbnail a partir de um frame do vídeo

**Options:** Processar no processo da API compromete latência; serviço externo gerenciado não roda integralmente no Compose; worker NestJS separado reutiliza DI/entidade e isola carga.

**Recommendation / Decision:** Container `video-worker` executa um contexto NestJS sem servidor HTTP e FFmpeg/ffprobe instalados na imagem. Baixa o objeto como stream para arquivo temporário, limita espaço em disco, obtém duração, codecs e dimensões via ffprobe JSON, extrai um frame com FFmpeg e envia JPEG ao storage. Remove temporários em `finally`. Reprocessamento é idempotente; falha terminal marca `error` e mantém o objeto para diagnóstico. [ffprobe](https://ffmpeg.org/ffprobe.html), [FFmpeg image2](https://www.ffmpeg.org/ffmpeg-formats.html).

**Libraries:** binários `ffmpeg`/`ffprobe` do Debian.

## TD-04: URL e entrega

**Capability:** URL única por vídeo, sem conflito com outros vídeos; reprodução via streaming; download do vídeo pelo usuário

**Options:** Slug baseado no título exige resolução de colisão/renomeação; UUID tem unicidade no banco e é estável. URL pré-assinada de GET expõe diretamente o storage; proxy da API permite contrato estável e headers de Range.

**Recommendation / Decision:** UUID é o identificador da URL (`/videos/{id}`). `GET /videos/{id}/stream` encaminha `Range` único ao S3 e devolve `206`, `Content-Range`, `Accept-Ranges`, `Content-Length`; `416` para intervalo inválido. Download usa o mesmo stream com `Content-Disposition: attachment`; thumbnail é servida por rota pública. Apenas status `ready` é público. Não há transcodificação nesta fase. [S3 GetObject Range](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html).

**Libraries:** SDK S3 já listado.

## TD-05: Status e falhas

**Capability:** Pré-cadastro como rascunho; processamento automático; ciclo de status refletido no banco

**Options:** Estado apenas na fila perde visibilidade de negócio; estado persistido permite consulta e reconciliação.

**Recommendation / Decision:** `draft → processing → ready | error`. Conclusão multipart confirmada transiciona para `processing`, então enfileira; falha de enqueue marca `error` para não deixar item preso. Worker só marca `ready` após thumbnail gravada; retry mantém `processing` até esgotar tentativas, depois grava `error` e mensagem curta. Operações de upload são permitidas só ao dono do canal e apenas em `draft`. Banco impõe unicidade de ID e chave de storage.

**Libraries:** TypeORM existente.
