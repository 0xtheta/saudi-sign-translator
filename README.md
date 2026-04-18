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

Run the frontend in a second terminal:

```bash
npm run dev
```

Default local URLs:

- App: `http://localhost:5173`
- Admin: `http://localhost:5173/admin`
- Backend: `http://127.0.0.1:8000`

## Notes

- The admin panel is intended for localhost use only.
- Uploaded animation files must be `.glb`.
- The backend stores records in `backend/data/` and uploaded files in `backend/uploads/`.
- Local speech transcription uses `faster-whisper`.
