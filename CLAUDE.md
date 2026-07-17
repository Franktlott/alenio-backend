# Vibecode Workspace

This workspace contains a mobile app and backend server.

<projects>
  mobile/   — Expo React Native app (main Alenio — chat/tasks; port 8081)
  temps/    — Expo React Native app (Alenio Temps — floor temperature checks)
  go-kiosk/ — Expo WebView shell (Alenio Go tablets)
  web/      — Enterprise / Alenio Go admin (Vite)
  backend/  — Hono API server (port 3000)
</projects>

<product_split_temps>
  Alenio Temps (temps/) is where associates take scheduled temperature checks.
  Alenio Go web (/go/temp-checks) is for Item Library, settings, manual entry when needed, and reviewing the day’s results — not primary floor capture.
  Temps data uses the backend walks APIs (TEMPERATURE items, schedules, occurrences, runs).
</product_split_temps>


<environment_variables>
  IMPORTANT: Use the correct env vars for each platform to avoid deployment failures.

  Backend (in backend/src/*.ts):
  - Use `env` from "./env" (validated via Zod) for backend env vars (PORT, NODE_ENV, etc.)
  - Always set `baseURL: env.BACKEND_URL` in Better Auth config (required for crossSubDomainCookies, harmless otherwise)
  - NEVER use `process.env.EXPO_PUBLIC_*` in backend code

  Mobile (in mobile/src/*.ts and temps/src/*.ts):
  - Use `process.env.EXPO_PUBLIC_BACKEND_URL` for API calls
  - EXPO_PUBLIC_* vars are bundled at build time

  Testing backend endpoints:
  - Use $BACKEND_URL environment variable in cURL commands
  - Do NOT use localhost
</environment_variables>

<agents>
  Use subagents for project-specific work:
  - mobile-developer: Changes to the mobile app
  - backend-developer: Changes to the backend API

  Each agent reads its project's CLAUDE.md for detailed instructions.
  When waiting for subagent results with TaskOutput, use a timeout of 600000ms.
</agents>

<coordination>
  When a feature needs both frontend and backend:
  1. Design the API contract (endpoint, request/response shape) in backend/src/types.ts
  2. Implement backend route first, test using cURL with $BACKEND_URL (do not use localhost)
  3. Implement mobile client second
  4. Test the integration
</coordination>

<startup_triage>
  On every user message, you will receive a <startup_error_summary> block (plus raw expo/backend logs).
  If it contains startup-blocking errors (e.g. TS2307, "Cannot find module", ERR_MODULE_NOT_FOUND), fix those first.

  Legacy import compat (temporary; removable once all projects are migrated):
  - If a legacy project fails on an import like `@/shared/contracts`, do NOT use symlinks and do NOT patch tsconfig.
  - Prefer minimal, local, repo-contained fixes:
    - Mobile: create `mobile/src/shared/contracts.ts` and re-export types/constants already present in the mobile app.
    - Backend: if backend uses `@/* -> src/*`, create `backend/src/shared/contracts.ts` and re-export from the backend’s real contracts/types file; otherwise refactor the import to a correct relative path.
</startup_triage>

<skills>
  Shared skills in .claude/skills/:
  - database-auth: Set up Prisma + Better Auth for user accounts and data persistence
  - ai-apis-like-chatgpt: Use this skill when the user asks you to make an app that requires an AI API.
  - upload-assets: Use this skill when the user asks you to store and use assets like images, audio, videos, etc.

  Frontend only skills:
  - frontend-app-design: Create distinctive, production-grade React Native Expo interfaces following iOS Human Interface Guidelines and liquid glass design principles. Use when building mobile screens, components, or styling any React Native UI.
  - expo-docs: Use this skill when the user asks you to use an Expo SDK module or package that you might not know much about.
</skills>

<environment>
  System manages git and dev servers. DO NOT manage these.
  The user views the app through Vibecode App.
  The user cannot see code or terminal. Do everything for them.
  Communicate in an easy to understand manner for non-technical users.
  Be concise and don't talk too much.
</environment>
