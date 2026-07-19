# Alenio Temps (mobile)

Separate Expo app for **taking temperature checks on the floor**.

## Product split

| Surface | Role |
|---------|------|
| **Alenio Temps** (`temps/`) | Associates take scheduled / available checks (probe or manual keypad). |
| **Alenio Go web** (`/go/temp-checks`) | Item Library, schedules, settings, **manual entry when needed**, day's results / oversight. |
| **Alenio** (`mobile/`) | Main workplace app (chat, tasks) — not Temps. |
| **Alenio Go kiosk** (`go-kiosk/`) | Floor tablet shell for other Go modules — not the primary Temps capture surface. |

Temps data uses the backend **walks** domain (`TEMPERATURE` library items, schedules, occurrences, runs).

## Env

- `EXPO_PUBLIC_BACKEND_URL` — API origin (same as mobile; never use localhost in curl tests)

## Run

```bash
cd temps && npm start
```

## API surface (session auth)

Floor capture is **local-first + sync** (not per-item PATCH).

- `GET /api/teams`
- `GET /api/teams/:teamId/walks/occurrences?from=&to=`
- `POST /api/teams/:teamId/walks/occurrences/:id/runs` — start (or `{ prepareOnly: true }` for offline warm-cache without claim)
- `POST /api/teams/:teamId/walks/runs/:runId/sync` — batch responses + CA completions + optional complete
- `POST /api/teams/:teamId/walks/runs/:runId/items/:itemId/reset`
- `POST /api/upload/json` — CA photos
- Auth token stored in SecureStore (`alenio-temps:access-token`)
