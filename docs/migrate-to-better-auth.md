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

**Owner:** Cursor · **Verify:** You

Replace Neon JWKS / `createAuthClient(NEON_AUTH_URL)` in `backend/src/auth.ts` with Better Auth session resolution (`auth.api.getSession` and/or Bearer validation matching the client).

**Keep the existing request pipeline:**

1. Resolve auth user from headers  
2. Sync into Prisma (`syncAppUserFromNeonAuth` → rename to `syncAppUserFromAuth`)  
3. Set `user` / `session` on context  
4. Leave `authGuard` and business routes alone  

Preserve `POST /api/auth/sync-user` for mobile post-login provisioning.

Retarget Neon-specific maintenance code so it no longer depends on the Neon Management API:

- `delete-neon-auth-user.ts`  
- `email-change.ts`  
- Admin verify / lookup SQL  
- `bootstrap-admin.ts`  

Deploy backend to **staging** (or a Railway environment) and confirm auth routes are live before flipping clients.

---

## Phase 3 — Web client

**Owner:** Cursor · **Verify:** You in the browser

1. Add `better-auth@1.4.18` in `web/`; prepare to remove `@neondatabase/auth`.  
2. Rewrite `web/src/lib/auth-client.ts` to use `{BACKEND_URL}/api/auth`.  
3. Update login, sign-up, reset/verify flows, `AuthGate`, and `SessionIdleGuard`.  
4. Keep `web/src/lib/api.ts` attaching the Bearer token.  
5. Drop `VITE_*_NEON_AUTH_URL` from `env-config`.  
6. Local test, then:

```bash
cd web && bun run build && cd .. && npx firebase-tools deploy --only hosting
```

Validate on https://alenio.com/login.

---

## Phase 4 — Mobile client

**Owner:** Cursor · **Verify:** You on a device

1. Add Better Auth; rewrite `mobile/src/lib/auth/auth-client.ts` to the backend auth base.  
2. Keep AsyncStorage token helpers and `Authorization` headers.  
3. Update `complete-auth-entry`, `use-session`, `sync-backend-user`, and auth error mapping.  
4. Update sign-in / sign-up / OTP / forgot / reset screens so UX stays the same.  
5. Remove `EXPO_PUBLIC_NEON_AUTH_URL` from `.env` and `eas.json`.  

**Device checklist**

- Fresh install → sign up → OTP → home with workspace  
- Kill app → still signed in  
- Sign out → APIs reject  
- Forgot password → OTP → new password → sign in  
- Existing data still visible (ID continuity)

---

## Phase 5 — Production cutover

**Owner:** You · **Support:** Cursor on standby

Execute in one sitting:

1. Deploy **backend** (Better Auth live).  
2. Spot-check auth endpoints.  
3. Deploy **web**.  
4. Ship **mobile** (build or OTA).  
5. Sign in yourself; confirm workspace data.  
6. **Disable Neon Auth** in Neon Console.  
7. Remove obsolete Neon Auth env vars once stable (~24–48h).

**Expect:** one forced re-login (old Neon JWTs will not validate).  
**If passwords fail:** use OTP reset; investigate hash compatibility on the branch before a second cutover.

### Rollback

1. Re-enable Neon Auth.  
2. Redeploy the previous backend + clients that use `@neondatabase/auth`.  
3. Restore the DB branch only if a destructive migration was applied (avoid that).

---

## Phase 6 — Microsoft Entra sign-in

Do this **after** email/password is green in production.

1. Configure `socialProviders.microsoft` on the Better Auth server.  
2. Add Railway env: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`.  
3. In Entra, set redirect URI:

```text
https://<BACKEND_URL>/api/auth/callback/microsoft
```

4. Add “Continue with Microsoft” on web (then mobile).  
5. Confirm Prisma user sync / linking by email rules you choose.

Keep **calendar** OAuth (`MICROSOFT_CALENDAR_*` → `/api/calendar-connections/microsoft/callback`) separate unless you intentionally share one Entra app with both redirect URIs.

**Later:** Better Auth SSO plugin for Okta / SAML when a customer requires it.

---

## Phase 7 — Cleanup

- Remove `@neondatabase/auth` from backend, mobile, and web  
- Delete dead JWKS / Neon client code  
- Rename remaining `neon`-branded helpers  
- Refresh `.env.example` files and any legal copy that names the provider  
- Archive or update this runbook’s “Today” section  

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
