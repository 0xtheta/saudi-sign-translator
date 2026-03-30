# Saudi Sign Translator

React + Vite app for Saudi Sign Language translation. Users enter an Arabic word or phrase, and a 3D RPM avatar presents the corresponding signs.

## Stack

- React 19
- Vite 7
- Three.js
- React Three Fiber
- Drei
- Tailwind CSS 4
- Framer Motion

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Project Structure

- `src/App.jsx` - app shell and mouse tracking
- `src/components/Scene.jsx` - Three.js scene, lights, environment, shadows
- `src/components/Avatar.jsx` - RPM GLB loading and head tracking
- `src/components/Interface.jsx` - chat input overlay
- `public/avatar/694ab0da452afe2bbfaa4e43.glb` - avatar asset
