/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Local dev only: development | production */
  readonly VITE_API_TARGET?: string;
  readonly VITE_DEV_BACKEND_URL?: string;
  readonly VITE_PROD_BACKEND_URL?: string;
  /** Legacy fallback */
  readonly VITE_BACKEND_URL?: string;
  /** Set to 1 with dev proxy so API calls use /api on the Vite host (iPad LAN testing). */
  readonly VITE_DEV_API_PROXY?: string;
  /** Override proxy target (defaults to resolved backend for VITE_API_TARGET). */
  readonly VITE_DEV_PROXY_TARGET?: string;
  readonly VITE_DEV_SERVER_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
