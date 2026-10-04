# StreamTube — Codex instructions

Read `CLAUDE.md` for the project contract and `nestjs-project/CLAUDE.md` for backend commands and test conventions. These rules apply equally to Codex. Work in `feature/*` from `dev`; never commit directly to `main`. The Fase 03 branch was created from `dev` and fast-forwarded with `main` because `dev` lacked the completed Fase 02.

## Workflow

For a phase, follow `research → plan-context → plan-validate ↔ plan-resolve → plan-build → implement`. The reusable instructions remain in `.claude/skills/{research,plan-context,plan-validate,plan-resolve,plan-build,implement}/SKILL.md`; Codex wrappers live in `.agents/skills/`. When Claude reader agents are mentioned, perform their bounded reads directly if equivalent agent dispatch is unavailable. Preserve the same artifacts and SI order.

Before using new library APIs, consult Context7 through the MCP configured in `.codex/config.toml`. If unavailable, use official documentation and record the fallback in `library-refs.md`.

## Backend and Docker

All application processes, npm commands and tests run inside Docker. Use Compose service names (`db`, `redis`, `minio`) for container traffic. `S3_PUBLIC_ENDPOINT` is a client-facing signed URL endpoint and may be `http://localhost:9000` on the developer's machine. Run unit, integration and e2e tests, then `npx tsc --noEmit` and lint before completion.

## Phase 03

`nestjs-project/src/videos/` owns video upload, processing and delivery. S3 compatible MinIO stores private source videos and thumbnails. BullMQ/Redis queues `video.process`; `video-worker` consumes jobs with FFmpeg/ffprobe. Upload uses presigned S3 multipart URLs; clients send bytes directly to object storage. `POST /videos` creates a draft; `/videos/:id/upload-parts` signs parts; `/videos/:id/complete` enqueues processing. Public ready videos expose `/videos/:id`, `/stream`, `/download`, and `/thumbnail`; owners query `/videos/:id/status`. See `docs/phases/phase-03-videos/phase-03-videos.md` for the contract.
