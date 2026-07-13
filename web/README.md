# Alenio enterprise web (Firebase Hosting)

Browser admin UI for teams. It uses the same **Better Auth** accounts as the mobile app (via the Alenio API) and calls `/web/api/...` with a **Bearer** token.

## Setup

```bash
cd web
bun install
cp .env.example .env
# Edit .env — set VITE_DEV_* / VITE_PROD_* backend URLs.
# Use VITE_API_TARGET=development|production to pick which pair the local dev server uses.
bun run dev
```

Open http://localhost:5173 — the API must allow this origin (localhost is already allowed on the backend).

## Deploy to Firebase Hosting

1. In [Firebase console](https://console.firebase.google.com), create or pick a project.
2. Install CLI: `npm i -g firebase-tools` then `firebase login`
3. From the **repo root** (where `firebase.json` lives):

```bash
cd web && bun install && bun run build && cd .. && firebase deploy --only hosting
```

Or from root: `npm run deploy` (builds web then deploys hosting).

Firebase Hosting serves `web/dist` and rewrites all routes to `index.html` for the SPA.

Set `CORS_ALLOWED_ORIGINS` on Railway to your `https://….web.app` / custom domain if needed (Firebase origins are often already allowlisted).
