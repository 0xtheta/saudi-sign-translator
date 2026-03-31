# Saudi Sign Translator

Local college project for matching normalized Arabic words or phrases to pre-made Saudi Sign Language avatar animations.

## Stack

- React + Vite frontend
- Python local backend
- SQLite database
- RPM avatar with `.glb` sign animations

## Development

Requirements:

- Node.js
- npm
- Python 3

Install frontend dependencies:

```bash
npm install
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
