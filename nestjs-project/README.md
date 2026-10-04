# StreamTube backend

Todos os serviços e comandos da aplicação rodam em Docker.

```bash
docker compose up -d --build
docker compose exec nestjs-api npm run migration:run
docker compose ps
```

API: `http://localhost:3000`. MinIO S3: `http://localhost:9000`, console: `http://localhost:9001`. Mailpit: `http://localhost:8025`. O Compose cria o bucket privado, configura CORS e inicia o worker. Se alterar `S3_PUBLIC_ENDPOINT` para uso em outra máquina, garanta que o navegador do cliente consegue alcançar esse endereço. Dentro dos containers, storage, Redis e banco são acessados pelos nomes `minio`, `redis` e `db`.

## Upload de vídeo

1. Obtenha JWT por `/auth/login`.
2. `POST /videos` com `{ "title": "...", "filename": "video.mp4", "content_type": "video/mp4", "size_bytes": 12345 }` cria o rascunho e informa `part_size` (64 MiB) e `part_count`.
3. `POST /videos/{id}/upload-parts` com `{ "part_numbers": [1, 2] }` retorna URLs pré-assinadas. Envie cada fatia do arquivo diretamente à URL com `PUT` e guarde o header `ETag` de cada resposta. Solicite novas URLs se as antigas expirarem.
4. `POST /videos/{id}/complete` com `{ "parts": [{ "part_number": 1, "etag": "..." }] }` conclui o upload. Informe todas as partes em ordem. O limite é 10.000.000.000 bytes.
5. `GET /videos/{id}/status` (JWT do dono) mostra `processing`, depois `ready` ou `error`.

Quando `ready`, `/videos/{id}` fornece metadados; `/stream` suporta `Range: bytes=0-1023`; `/download` entrega o arquivo completo e `/thumbnail` entrega JPEG. Todas as rotas de leitura do vídeo pronto são públicas.

## Verificação

```bash
docker compose exec nestjs-api npm test -- --runInBand
docker compose exec nestjs-api npm run test:e2e
docker compose exec nestjs-api npx tsc --noEmit
docker compose exec nestjs-api npm run lint
```

O teste e2e de vídeos requer o `video-worker`, Redis e MinIO ativos. O worker usa espaço temporário em volume Docker para baixar um vídeo por vez; reserve pelo menos 10 GB livres ao testar arquivos no limite.
