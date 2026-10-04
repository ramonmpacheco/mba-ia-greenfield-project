---
kind: phase
name: phase-03-videos
sources:
  - docs/project-plan.md
  - docs/decisions/technical-decisions-phase-03-videos.md
  - docs/phases/phase-02-auth/phase-02-auth.md
---

# phase-03-videos — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities:** storage de vídeos e thumbnails; fila e worker; upload direto de até 10 GB; rascunho automático; metadados/duração; thumbnail; URL única; streaming; download.

**Out of scope:** UI de vídeo, edição/gerenciamento de vídeos da Fase 04, transcodificação adaptativa e interações sociais.

**Affected subprojects:** `nestjs-project/` e sua infraestrutura Compose.

**Dependencies:** Fases 01 e 02. `Channel` e JWT já existem. `dev` estava atrás de `main`; a branch de feature foi criada de `dev` e atualizada com `main` antes do trabalho.

## Decisions Index

| Ref | Capability | Decision | Libraries |
|---|---|---|---|
| TD-01 | Fila e worker | BullMQ + Redis; worker isolado | `@nestjs/bullmq`, `bullmq` |
| TD-02 | Upload 10 GB e rascunho | Multipart S3 direto, 64 MiB | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| TD-03 | Processamento e thumbnail | FFprobe/FFmpeg no worker | binários Debian |
| TD-04 | URL, streaming, download | UUID e proxy Range | SDK S3 |
| TD-05 | Status e falhas | `draft → processing → ready/error` | TypeORM |

## Capability Coverage

| Capability do plano | Origem |
|---|---|
| Armazenamento de vídeos e thumbnails | Plano + TD-02 |
| Serviço de processamento em segundo plano | Plano + TD-01/03 |
| Upload até 10 GB sem travar | Plano + TD-02 |
| Rascunho automático | Plano + TD-02/05 |
| Extração de duração e metadados | Plano + TD-03 |
| Thumbnail automática | Plano + TD-03 |
| URL única | Plano + TD-04 |
| Streaming | Plano + TD-04 |
| Download | Plano + TD-04 |

## Existing Contracts

- `JwtAuthGuard` global; `@Public()` libera apenas leitura pronta.
- JWT contém `sub` do usuário; `channels.user_id` identifica o canal dono.
- TypeORM com migrations versionadas e `synchronize: false`.
- Testes unitários, integração real e e2e seguem os sufixos definidos em `nestjs-project/CLAUDE.md`.
- Docker usa nome do serviço para tráfego interno. URLs pré-assinadas são destinadas a clientes externos e usam endpoint público configurado.

## Decisions Detail

O documento `docs/decisions/technical-decisions-phase-03-videos.md` contém opções, trade-offs, escolhas e referências para TD-01 a TD-05. Todas estão decididas; não há questão de produto aberta para esta fase.

## Open Questions

_Nenhuma._
