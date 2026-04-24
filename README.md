# Saudi Sign Translator

## Development

Requirements:

- Node.js
- npm
- Python 3

Install frontend dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
python3 -m pip install -r backend/requirements.txt
```

Run the backend:

```bash
npm run backend
```

Backend transcription runtime selection:

- Apple Silicon macOS defaults to `mlx-whisper`.
- Other platforms default to `faster-whisper` with `WHISPER_DEVICE=cuda`.
- Override with `WHISPER_BACKEND=mlx` or `WHISPER_BACKEND=faster-whisper`.
- For the `faster-whisper` path, use `WHISPER_DEVICE=cuda` on your Linux RTX box.

Run the frontend in a second terminal:

```bash
npm run dev
```

Default local URLs:

- App: `http://localhost:5173`
- Admin: `http://localhost:5173/admin`
- Backend: `http://127.0.0.1:8000`

## Docker Deployment

Start:

```bash
docker compose up -d --build
```

Update after code changes:

```bash
git pull
docker compose up -d --build
```

By default, Docker serves the app on:

- `http://<server-ip>:5173`

Data persistence is handled with Docker volumes:

- `sign_data` (SQLite)
- `sign_uploads` (uploaded `.glb` files)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Cloudflare Access gating, env variables, and backup notes.

## Notes

- Admin API protection is controlled by `APP_ADMIN_AUTH_MODE`:
  - `local_only` (default)
  - `cf_access`
  - `open` (not recommended)
- Uploaded animation files must be `.glb`.
- The backend stores records in `backend/data/` and uploaded files in `backend/uploads/`.
- Local speech transcription uses `faster-whisper`.
