# Alenio Go Kiosk (mock native wrapper)

Thin Expo shell for floor tablets. It loads the existing Alenio Go web kiosk in a full-screen WebView.

## What it does (mock v0.1)

- Opens `https://alenio.app/aleniogo` until a workspace is linked
- After link approval, reopens `https://alenio.app/checklist/{hubToken}`
- Keeps the screen awake while the app is open
- Remembers the linked workspace between launches
- Registers a mock Expo push token locally (backend hookup comes later)

## Run locally

```bash
cd go-kiosk
cp .env.example .env
npm install
npm run start
```

Use Expo Go or a dev build on an iPad/tablet. For store tablets, prefer a dedicated dev client build later.

## Env

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_GO_WEB_URL` | Web host for link + kiosk pages (default `https://alenio.app`) |

## Next steps (not in mock)

- POST device push token to backend when linked
- Open alert deep links from notification taps
- Hide the native header bar in production kiosk mode
