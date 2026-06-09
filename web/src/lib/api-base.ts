import { getResolvedBackendUrl, usesDevApiProxy } from "./env-config";

/**
 * API origin for fetch(). In dev with VITE_DEV_API_PROXY=1, returns "" so requests use the Vite dev
 * host (e.g. iPad → http://192.168.x.x:5173) and /api is proxied to the active backend URL.
 */
export function getWebApiBase(): string {
  if (usesDevApiProxy()) return "";
  return getResolvedBackendUrl();
}
