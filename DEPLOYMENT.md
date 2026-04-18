# Deployment Guide (Docker + Cloudflare Access)

## 1) What This Setup Does

- Runs the frontend as an Nginx container.
- Runs the backend as a Python container.
- Persists SQLite DB and uploaded `.glb` files in Docker volumes.
- Lets you redeploy app code without losing data.

Persistent volumes:

- `sign_data` -> `/app/backend/data`
- `sign_uploads` -> `/app/backend/uploads`

## 2) First Deploy

```bash
docker compose up -d --build
```

Open app:

- `http://<server-ip>:5173`
- Admin route: `http://<server-ip>:5173/admin`

## 3) Update App After Code Changes

```bash
git pull
docker compose up -d --build
```

This rebuilds/restarts containers while keeping DB/uploads intact.

## 4) Cloudflare Access Protection Model

Recommended:

- Protect `/admin` and `/api/admin/*` with Cloudflare Access policies.
- Keep learner routes public if needed.
- Do not expose backend `8000` directly to the internet.

In this project, backend admin auth is controlled by:

- `APP_ADMIN_AUTH_MODE=local_only` (default): admin APIs local-only
- `APP_ADMIN_AUTH_MODE=cf_access`: requires Cloudflare Access user header
- `APP_ADMIN_AUTH_MODE=open`: no backend admin auth (not recommended)
- `APP_ADMIN_ALLOWED_EMAILS`: comma-separated admin emails (required for `cf_access`)

`docker-compose.yml` currently defaults to:

- `APP_ADMIN_AUTH_MODE=cf_access`
- `APP_ADMIN_ALLOWED_EMAILS=` (you must set this)

Example:

```bash
APP_ADMIN_ALLOWED_EMAILS="friend1@example.com,friend2@example.com" docker compose up -d --build
```

Cloudflare Access side:

- Create an Access app for your domain/hostname.
- Include `/admin*` and `/api/admin/*` in protected paths.
- Add policy allowing only your team emails.

## 5) Environment Knobs

Whisper settings in `docker-compose.yml`:

- `WHISPER_MODEL_SIZE` (default `small`)
- `WHISPER_DEVICE` (default `cpu`)
- `WHISPER_COMPUTE_TYPE` (default `int8`)

HTTP port:

- `APP_HTTP_PORT` (default `5173`)

Example:

```bash
APP_HTTP_PORT=8080 WHISPER_MODEL_SIZE=medium docker compose up -d --build
```

## 6) Backup Data

Data is in Docker volumes:

- `sign_data`
- `sign_uploads`

Back up both volumes regularly before major changes.
