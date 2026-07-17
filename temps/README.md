# Alenio Temps

Phone app for associates to **take temperature checks**.

**Alenio Go** (enterprise web) configures Item Library / schedules and is used to **manually enter** temps when needed and to **review the day’s results** — not as the primary capture app on the floor.

## Setup

```bash
cd temps
npm install
# set EXPO_PUBLIC_BACKEND_URL in .env (same API as main Alenio)
npm start
```

## Foundation included

- Sign-in (email / password via Better Auth)
- Workspace (team) picker
- Today’s available checks
- Start check → enter temperature → submit → complete run
