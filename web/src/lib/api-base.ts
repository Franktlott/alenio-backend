/**
 * API origin for fetch(). In dev with VITE_DEV_API_PROXY=1, returns "" so requests use the Vite dev
 * host (e.g. iPad → http://192.168.x.x:5173) and /api is proxied to the backend on this machine.
 */
export function getWebApiBase(): string {
  const configured = import.meta.env.VITE_BACKEND_URL?.trim().replace(/\/+$/, "") ?? "";
  const proxy =
    import.meta.env.DEV &&
    (import.meta.env.VITE_DEV_API_PROXY === "1" ||
      import.meta.env.VITE_DEV_API_PROXY?.toLowerCase() === "true");
  if (proxy) return "";
  return configured;
}
