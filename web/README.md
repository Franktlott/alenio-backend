# Alenio enterprise web (Firebase Hosting)

Browser admin UI for teams. It uses the same **Neon Auth** accounts as the mobile app and calls the Alenio API under `/web/api/...` with a **Bearer** token.

## Setup

```bash
cd web
bun install
cp .env.example .env
# Edit .env — set VITE_DEV_* (dev Railway + Neon Auth) and VITE_PROD_* (production).
# Use VITE_API_TARGET=development|production to pick which pair the local dev server uses.
bun run dev
```

Open http://localhost:5173 — the API must allow this origin (localhost is already allowed on the backend).

## Deploy to Firebase Hosting

1. In [Firebase console](https://console.firebase.google.com), create or pick a project.
2. `npm i -g firebase-tools` (or use `npx firebase-tools`).
3. From the **repo root**: `firebase login` then `firebase init hosting` **or** copy `.firebaserc.example` to `.firebaserc` and set your project id (already have `firebase.json` at repo root).
4. Set **Railway** (or your host) env **`CORS_ALLOWED_ORIGINS`** to your Hosting URLs, comma-separated, for example:
   - `https://YOUR_PROJECT_ID.web.app,https://YOUR_PROJECT_ID.firebaseapp.com`
5. In **Neon Auth / Better Auth** trusted origins, add those same HTTPS origins so sign-in from the hosted site is allowed.
6. Build and deploy:

```bash
cd web && bun install && bun run build && cd .. && firebase deploy --only hosting
```

`firebase.json` serves the SPA from `web/dist` with a rewrite to `index.html`.

## Security

Do not commit `web/.env`. Production secrets belong in Firebase **environment** only for build-time `VITE_*` injection, or use your CI to inject them during `bun run build`.
