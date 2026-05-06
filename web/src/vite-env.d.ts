/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
  readonly VITE_NEON_AUTH_URL: string;
  /** Set to 1 with dev proxy so API calls use /api on the Vite host (iPad LAN testing). */
  readonly VITE_DEV_API_PROXY?: string;
  /** Override proxy target (default http://127.0.0.1:3000). */
  readonly VITE_DEV_PROXY_TARGET?: string;
  readonly VITE_DEV_SERVER_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
