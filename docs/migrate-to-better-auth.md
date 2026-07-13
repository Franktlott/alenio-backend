# Migrating Alenio to Better Auth

A practical runbook for moving from **Neon Auth** (managed) to **self-hosted Better Auth** on the Alenio API.

| | |
|---|---|
| **Goal** | Own auth on Railway, keep Neon Postgres + existing `User.id` values, unlock Microsoft / SSO |
| **Scope** | `backend/` (Hono) · `mobile/` (Expo) · `web/` (Vite) |
| **Effort** | ~2–4 focused days with Cursor · +½–1 day for Microsoft sign-in |
| **Hard rule** | Never run Neon Auth and Better Auth as dual writers on the same tables in production |

---

## Why this migration

Neon Auth is Better Auth under the hood, but managed. That is fine for email/password today. It is **not** enough when you need:

- Microsoft Entra sign-in  
- Customer SSO (OIDC / SAML)  
- Custom auth plugins and full control of the auth server  

Self-hosting Better Auth on the Alenio backend is the natural next step: same concepts, same database family, same app user model.

---

## Architecture at a glance

```text
TODAY
  Mobile / Web ──► Neon Auth (hosted) ──► neon_auth.*
                         │
                         └─ JWT ──► Alenio API ──► sync ──► public."User"

TARGET
  Mobile / Web ──► Alenio API /api/auth/* (Better Auth) ──► neon_auth.*
                         │
                         └─ session/token ──► same middleware ──► public."User"
```

What stays stable: Prisma app data, workspace membership, and (if schema aligns) auth user IDs.  
What changes: who issues sessions, which SDK clients call, and where secrets live.

---

## Who does what

| Cursor | You |
|--------|-----|
| Packages, Better Auth config, route mount | Neon branch / backup |
| Session middleware rewrite | Railway, EAS, web env secrets |
| Web + mobile auth clients and screens | Deployments (Railway, Firebase, app) |
| Neon helper cleanup and types | Disable Neon Auth after cutover |
| Microsoft provider wiring | Entra app redirect URIs + live testing |

---

## Before / after

| | Today | After |
|---|--------|--------|
| Auth host | Neon Auth URL | `{BACKEND_URL}/api/auth` |
| Client SDK | `@neondatabase/auth` | `better-auth` client |
| Auth tables | `neon_auth` schema | Same DB; prefer same schema |
| App users | Prisma `User.id` = auth user id | Unchanged when IDs carry over |
| Login | Email/password + email OTP | Same UX, new server |
| Microsoft | Calendar OAuth only | Sign-in (Phase 6) + calendar unchanged |

**Version pin:** install Better Auth **~1.4.18** (Neon Auth’s Better Auth generation) so `neon_auth` stays compatible.

### Code touchpoints

**Backend:** `src/auth.ts`, `src/index.ts`, `src/env.ts`, `src/lib/ensure-app-user.ts`, delete-user / email-change / admin neon_auth paths  

**Mobile:** `src/lib/auth/*`, sign-in / sign-up / verify-otp / forgot / reset screens  

**Web:** `src/lib/auth-client.ts`, `src/lib/api.ts`, login / sign-up / auth gates  

**Env to retire after cutover:** `NEON_AUTH_URL`, `EXPO_PUBLIC_NEON_AUTH_URL`, `VITE_*_NEON_AUTH_URL`

---

## Recommended session model

Keep Alenio’s current pattern during migration:

- **Mobile:** Bearer token in `Authorization` (AsyncStorage)  
- **Web:** Bearer as well (simplest parity)  

Cookies can come later for web-only polish. Do not invent a hybrid cookie/Bearer design on cutover day.

---

## Definition of done

Migration is complete when all of the following are true:

1. Email sign-up, OTP verification, sign-in, and password reset work on **web and mobile**  
2. Returning users land on the same workspace data (same `User.id`)  
3. Sign-out and cold start behave correctly  
4. Account deletion removes auth + app user  
5. Neon Auth is **disabled**; only Better Auth serves login  
6. (Optional Phase 6) Microsoft sign-in works on web  

---

# Migration phases

Work **one phase at a time**. Do not combine cutover and Microsoft on the same day.

---

## Phase 0 — Prepare

**Owner:** You (with a short Cursor checklist)

1. **Snapshot the database**  
   Create a Neon branch from production (or equivalent backup).

2. **Inventory secrets** (password manager)  
   - Railway: `DATABASE_URL`, `BACKEND_URL`, `NEON_AUTH_URL`, Resend, etc.  
   - Mobile EAS: `EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_NEON_AUTH_URL`  
   - Web: prod backend + Neon Auth URLs  
   - Microsoft login credentials (Client ID, Tenant, Secret) — **separate** from `MICROSOFT_CALENDAR_*`

3. **Note the current Neon Auth base URL**  
   Shape: `https://ep-….neonauth….aws.neon.tech/neondb/auth`

4. **Agree on success criteria** (section above) and a rollback commit / Railway deployment.

---

## Phase 1 — Backend: Better Auth server

**Status: started in repo (2026-07-12)**  
Code lives in `backend/src/lib/better-auth.ts` and mounts `/api/auth/**` when `BETTER_AUTH_SECRET` is set.

**Owner:** Cursor · **Verify:** You

### Install

```bash
cd backend
bun add better-auth@1.4.18 pg
```

### Implement

1. `backend/src/lib/better-auth.ts`:
   - Postgres pool → `DATABASE_URL` with `search_path=neon_auth`
   - `baseURL: env.BACKEND_URL`
   - `secret: env.BETTER_AUTH_SECRET`
   - Email/password + email OTP (Resend) + bearer plugin
   - `trustedOrigins` includes alenio.com / localhost / Firebase host

2. Mounted in `backend/src/index.ts` **after** `/api/auth/sync-user` so that route is preserved.

3. `BETTER_AUTH_SECRET` added to `backend/src/env.ts` (optional until you set it) and `.env.example`.

### Your next action (required to activate)

1. Generate a secret: `openssl rand -base64 32`
2. Set **`BETTER_AUTH_SECRET`** on Railway (production + any staging).
3. Redeploy the backend.
4. Confirm `GET /health` includes `"betterAuthEnabled": true`.
5. Optionally hit `POST /api/auth/sign-up/email` on the API host (schema may need additive migrate on a Neon branch first — see below).

### Schema

1. Inspect `neon_auth` tables on a **branch**.  
2. Run Better Auth migrate/generate against the branch.  
3. Apply **additive** changes only.  
4. Prove email sign-in against branch data before touching production.

### Smoke test

Confirm `/api/auth/...` responds on local/staging (sign-up, sign-in, get-session). Fix plugin/schema gaps here—not in the mobile app.

**Note:** Until Phases 2–4, mobile and web still authenticate against Neon Auth. Phase 1 only stands up the new auth server beside the existing app.

---

## Phase 2 — Backend: session verification

**Status: done in repo (2026-07-12)** — dual verify: Better Auth first, Neon Auth fallback.

**Owner:** Cursor · **Verify:** You

`backend/src/auth.ts` now:

1. Tries Better Auth `getSession` when `/api/auth` is mounted  
2. Falls back to Neon JWKS / Neon session API so **current mobile + web keep working**

Prisma sync + `/api/auth/sync-user` unchanged.  
Email/password admin helpers still use Neon until Phases 3–4 (same `neon_auth` users).

After deploy, `/health` should show `"betterAuthSessionVerify": true`.

---

## Phase 3 — Web client

**Status: done in repo (2026-07-12)** — web login uses Better Auth on `{BACKEND_URL}/api/auth`.

**Owner:** Cursor · **Verify:** You in the browser

1. `better-auth@1.4.18` in `web/`; auth client no longer uses `@neondatabase/auth`.  
2. `web/src/lib/auth-client.ts` points at the Alenio backend.  
3. Login / sign-up / OTP / reset flows + AuthGate accept Better Auth bearer tokens.  
4. Env only requires `VITE_*_BACKEND_URL` (Neon Auth URL optional/legacy).  
5. Deploy Firebase Hosting after build.

**You:** Open https://alenio.com/login, sign in with your existing email/password, confirm dashboard loads.

---

## Phase 4 — Mobile client

**Status: done & verified (2026-07-12)** — mobile login uses Better Auth on `{EXPO_PUBLIC_BACKEND_URL}/api/auth`.

**Owner:** Cursor · **Verify:** You on a device ✓

1. `better-auth@1.4.18` in `mobile/`; auth client no longer uses `@neondatabase/auth`.
2. `mobile/src/lib/auth/auth-client.ts` points at the Alenio backend.
3. AsyncStorage token helpers + `Authorization` headers kept; opaque bearer tokens supported.
4. Sign-in / sign-up / OTP / forgot / reset screens keep the same UX.
5. `EXPO_PUBLIC_NEON_AUTH_URL` removed from `.env` and `eas.json`.

**Device checklist**

- Fresh install → sign up → OTP → home with workspace
- Kill app → still signed in
- Sign out → APIs reject
- Forgot password → OTP → new password → sign in
- Existing data still visible (ID continuity)

**You:** Sign in on device with the same email/password as web; confirm chats/workspaces load. ✓

---

## Phase 5 — Production cutover

**Status: recovered (2026-07-12)** — Neon Auth Console disable wiped `neon_auth` tables; schema recreated by API.

**What happened:** Disabling Neon Auth with **delete data** removed login tables (`user` / `session` / `account`). App data in Prisma was not deleted. The API now recreates empty Better Auth tables on boot / `/api/auth-schema-check`.

**You — get back in**

1. Open https://alenio.com/login → **Create account** (same email as before).  
2. Verify the email code.  
3. Sign in — workspaces should reconnect by email.  
4. Do the same on mobile if needed.  
5. Do **not** re-enable Neon Auth in Neon Console (leave it off).  

Optional: remove Railway `NEON_AUTH_URL` if still present.

### Rollback

1. Neon branch/PITR restore only if you need old password hashes (usually unnecessary — re-sign-up is enough).  
2. Redeploy a previous backend that still had the Neon JWT fallback only if Better Auth itself is broken.

---

## Phase 6 — Microsoft Entra sign-in

Do this **after** email/password is green in production.

1. Configure `socialProviders.microsoft` on the Better Auth server.  
2. Add Railway env: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`.  
3. In Entra (App registration → Authentication):
   - Platform: **Web** (not SPA)
   - Redirect URI (exact):

```text
https://alenio-backend-production.up.railway.app/api/auth/callback/microsoft
```

   - Remove any URI that is only the Railway homepage, `alenio.app`, or `alenio.com/auth/callback`
   - Client secret under Certificates & secrets must match Railway `MICROSOFT_CLIENT_SECRET`
4. Add “Continue with Microsoft” on web (then mobile).  
5. Confirm Prisma user sync / linking by email rules you choose.

Keep **calendar** OAuth (`MICROSOFT_CALENDAR_*` → `/api/calendar-connections/microsoft/callback`) separate unless you intentionally share one Entra app with both redirect URIs.

**Later:** Better Auth SSO plugin for Okta / SAML when a customer requires it.

---

## Phase 7 — Cleanup

**Status: done (2026-07-12)**

- [x] Remove `@neondatabase/auth` from backend, mobile, and web  
- [x] Delete dead JWKS / Neon client session path  
- [x] Refresh `.env.example` files  
- [x] Rename helpers (`syncAppUserFromAuth`, `deleteAuthUser`, etc.; schema name `neon_auth` stays)  
- [x] Code ignores retired `alenio.app` / obsolete `NEON_AUTH_URL` — remove those vars from Railway if still present  

**Phase 6 mobile:** Microsoft sign-in uses `/api/oauth/microsoft/start` + `alenio://auth-callback` deep link (same Entra redirect URI as web).

### Organization + SSO (schema only, 2026-07-12)

Prisma models added (no admin UI / login routing yet):

- `Organization`, `OrganizationDomain`, `OrganizationSsoConfig`, `OrganizationMembership`
- `Team.organizationId` (optional link workspace → company)

---

## Environment reference (end state)

**Railway**

```env
DATABASE_URL=...
BACKEND_URL=https://alenio-backend-production.up.railway.app
BETTER_AUTH_SECRET=...
RESEND_API_KEY=...
FROM_EMAIL=noreply@alenio.com
WEB_PUBLIC_URL=https://alenio.com

# Sign-in (Phase 6)
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=...

# Calendar (unchanged; separate concern)
MICROSOFT_CALENDAR_CLIENT_ID=...
MICROSOFT_CALENDAR_CLIENT_SECRET=...
```

**Mobile**

```env
EXPO_PUBLIC_BACKEND_URL=https://alenio-backend-production.up.railway.app
```

**Web**

```env
VITE_PROD_BACKEND_URL=https://alenio-backend-production.up.railway.app
```

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Schema drift from Neon Auth | Pin ~1.4.18; migrate on a Neon branch first |
| Password hashes don’t verify | Prove on branch; OTP reset as escape hatch |
| Missing email OTP plugin | Match current mobile OTP flows in Phase 1 |
| Callback / deep link rejected | HTTPS callbacks + `trustedOrigins` |
| Dual writers corrupt auth state | Disable Neon Auth immediately after flip |
| Mixing calendar and login Microsoft apps | Separate env vars and redirect URIs |

---

## How to run this with Cursor

Use a **fresh chat per phase**:

1. *“Phase 1: Add Better Auth 1.4.x on the backend, mount `/api/auth/*`, reuse `neon_auth`, Resend + email OTP to match mobile. Don’t touch clients yet.”*  
2. *“Phase 2: Replace Neon session verification with Better Auth; keep Prisma sync and `/api/auth/sync-user`.”*  
3. *“Phase 3: Migrate the web auth client and login flows.”*  
4. *“Phase 4: Migrate mobile auth client and OTP screens; keep Bearer + AsyncStorage.”*  
5. *“Phase 6: Add Microsoft social login on web.”*  

---

## Start here

When ready: **“Start Phase 1 — Better Auth on the backend.”**

Ship Phase 1–2 on a Neon branch, then web, then mobile, then cut over. Add Microsoft only when email auth is boringly reliable.
