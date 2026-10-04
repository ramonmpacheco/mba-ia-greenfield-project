---
kind: phase
name: phase-03-videos
status: ready
validation: clean
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Entregar a API e infraestrutura da Fase 03 conforme `docs/project-plan.md`, com upload direto de até 10 GB, processamento, URL única e entrega parcial ou completa. Decisões em `docs/decisions/technical-decisions-phase-03-videos.md`.

## Step Implementations

### SI-03.1 — Infraestrutura e dependências

**Dependencies:** Fases 01–02.

**Technical actions:** adicionar MinIO, inicialização de bucket, Redis com AOF, `video-worker` em Compose; instalar SDK S3 e BullMQ; configurar variáveis Joi, endpoints interno/externo de S3 e conexão Redis. Dockerfile instala FFmpeg. Nenhum serviço usa `localhost` para comunicação entre containers.

**Tests:** `docker compose config`, healthchecks, build e inicialização de serviços.

**Acceptance:** storage, Redis e worker sobem junto com API e banco.

### SI-03.2 — Entidade, migration e repositório

**Dependencies:** SI-03.1.

**Technical actions:** criar entidade `Video` com FK para `Channel`, UUID único, status, dados de upload, chaves de objeto, metadados e timestamps; migration e repository; acesso de dono por `channels.user_id`.

**Tests:** integração real de migration, FK, unicidade e consultas.

**Acceptance:** rascunhos persistem e são associados a um canal.

### SI-03.3 — Upload direto e fila

**Dependencies:** SI-03.2.

**Technical actions:** criar rascunho/sessão multipart; assinar partes; concluir e validar objeto com `HeadObject`; abortar; aplicar autorização, tamanho e transições; publicar `video.process` com `jobId=videoId`.

**Tests:** unitários de limites/transições; integração com S3, Redis e banco; e2e dos endpoints sem mock de infraestrutura.

**Acceptance:** API nunca recebe bytes de vídeo; 10 GB podem ser enviados em partes diretamente ao MinIO.

### SI-03.4 — Worker e thumbnail

**Dependencies:** SI-03.3.

**Technical actions:** consumer no processo/container worker; stream S3 para arquivo temporário; ffprobe JSON e FFmpeg frame único; upload da thumbnail; atualização idempotente do banco; retry e estado terminal de erro.

**Tests:** integração real com FFmpeg, storage, Redis e banco; exercício do job até `ready` e `error`.

**Acceptance:** metadados, duração, thumbnail e status são persistidos automaticamente.

### SI-03.5 — Leitura, streaming e download

**Dependencies:** SI-03.4.

**Technical actions:** leitura pública de vídeo pronto; streaming de `GetObject` com Range único, `206`/`416`, download com disposition attachment; rota de thumbnail; isolamento dos rascunhos.

**Tests:** e2e de leitura, `Range`, download, thumbnail, status e autorização.

**Acceptance:** reprodução parcial e download funcionam sem buffer integral.

### SI-03.6 — Fechamento

**Dependencies:** SI-03.5.

**Technical actions:** atualizar `AGENTS.md`, `CLAUDE.md`, README e `progress.md`; revisar critérios e executar Definition of Done inteira.

**Tests:** `npm test -- --runInBand`, `npm run test:e2e`, `npx tsc --noEmit`, `npm run lint` dentro de `nestjs-api`.

**Acceptance:** todas as suítes verdes e documentação fiel ao código.

## Technical Specifications

### Data Model

`videos`: `id uuid PK`, `channel_id uuid FK NOT NULL`, `title varchar(255)`, `status varchar(16)` (`draft|processing|ready|error`), `storage_key varchar UNIQUE`, `thumbnail_key varchar NULL`, `upload_id text NULL`, `expected_size bigint`, `actual_size bigint NULL`, `content_type varchar(255)`, `original_filename varchar(255)`, `duration_seconds numeric NULL`, `metadata jsonb NULL`, `error_message text NULL`, `created_at`, `updated_at`. UUID serve de identificador único de URL. FK impede vídeo sem canal.

### API Contracts

| Método e rota | Auth | Entrada | Saída |
|---|---|---|---|
| `POST /videos` | JWT | `{title, filename, content_type, size_bytes}` | `201 {id,status,part_size,part_count}` |
| `POST /videos/:id/upload-parts` | dono | `{part_numbers:number[]}` | `200 {parts:[{part_number,url}]}` |
| `POST /videos/:id/complete` | dono | `{parts:[{part_number,etag}]}` | `202 {id,status}` |
| `DELETE /videos/:id/upload` | dono | — | `204` |
| `GET /videos/:id/status` | dono | — | `200` metadados e status |
| `GET /videos/:id` | público se pronto | — | `200` metadados |
| `GET /videos/:id/stream` | público se pronto | `Range?: bytes=start-end` | `200/206` stream |
| `GET /videos/:id/download` | público se pronto | — | `200` attachment |
| `GET /videos/:id/thumbnail` | público se pronto | — | `200 image/jpeg` |

O cliente divide o arquivo em partes de 64 MiB, faz `PUT` diretamente às URLs, lê `ETag` de cada resposta e chama `complete`. MinIO usa CORS global via `MINIO_API_CORS_ALLOW_ORIGIN` e expõe `ETag` para clientes browser; em S3 de produção, configure CORS no bucket. URLs de partes expiram em 15 min e podem ser renovadas chamando `upload-parts` novamente.

### Authorization Matrix

| Operação | Anônimo | Autenticado sem posse | Dono |
|---|---|---|---|
| Criar vídeo | 401 | cria no próprio canal | cria no próprio canal |
| Assinar/concluir/abortar | 401 | 404 | permitido em `draft` |
| Consultar rascunho/erro em `/status` | 401 | 404 | 200 |
| Ler pronto/stream/download/thumbnail | 200 | 200 | 200 |

### Error Catalog

| Código | HTTP | Situação |
|---|---|---|
| `VIDEO_NOT_FOUND` | 404 | ID ausente, vídeo privado de outro dono |
| validação de `size_bytes` | 400 | 0 ou >10.000.000.000 bytes |
| `VIDEO_INVALID_PART` | 400 | parte fora de 1..part_count, duplicada ou sequência incompleta |
| `VIDEO_INVALID_STATE` | 409 | operação fora de `draft` |
| `VIDEO_UPLOAD_INCOMPLETE` | 400 | partes ausentes ou tamanho final divergente |
| `VIDEO_RANGE_INVALID` | 416 | Range malformado, múltiplo ou fora do arquivo |

### Events/Messages

Fila BullMQ `video-processing`. Job `video.process`: `{videoId: string}`; `jobId=videoId`, tentativas 3, backoff exponencial inicial de 1 s. Producer publica após completar objeto e persistir `processing`. Consumer é idempotente: `ready` é no-op, `processing` pode repetir. Na tentativa terminal falha, persiste `error` e mensagem curta. O objeto fonte permanece no storage. Falha no enqueue é explicitamente refletida como `error`.

## Dependency Map

`SI-03.1 → SI-03.2 → SI-03.3 → SI-03.4 → SI-03.5 → SI-03.6`.

## Deliverables

- `docs/decisions/technical-decisions-phase-03-videos.md` e artefatos desta pasta.
- Módulo `videos/`, migration, API, worker FFmpeg e testes.
- `compose.yaml` com API, PostgreSQL, Mailpit, MinIO, Redis e worker.
- Upload direto de até 10 GB, processamento/thumbnail, UUID, streaming e download.
- Documentação de IA portada para Codex e atualizada.
