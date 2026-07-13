export type ApiTarget = "development" | "production";

type EnvRecord = Record<string, string | boolean | undefined>;

function trimUrl(v: string | undefined): string {
  return v?.trim().replace(/\/+$/, "") ?? "";
}

function isTruthyFlag(v: string | boolean | undefined): boolean {
  if (v === true) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  }
  return false;
}

/** Which backend/auth pair is active. Production builds always use production. */
export function resolveApiTarget(env: EnvRecord, isProdBuild: boolean): ApiTarget {
  if (isProdBuild) return "production";
  const t = typeof env.VITE_API_TARGET === "string" ? env.VITE_API_TARGET.trim().toLowerCase() : "";
  if (t === "production" || t === "prod") return "production";
  return "development";
}

export function resolveNeonAuthUrl(env: EnvRecord, isProdBuild: boolean): string {
  const target = resolveApiTarget(env, isProdBuild);
  const dev = trimUrl(typeof env.VITE_DEV_NEON_AUTH_URL === "string" ? env.VITE_DEV_NEON_AUTH_URL : undefined);
  const prod = trimUrl(typeof env.VITE_PROD_NEON_AUTH_URL === "string" ? env.VITE_PROD_NEON_AUTH_URL : undefined);
  const legacy = trimUrl(typeof env.VITE_NEON_AUTH_URL === "string" ? env.VITE_NEON_AUTH_URL : undefined);
  if (target === "production") return prod || legacy;
  return dev || legacy;
}

export function resolveBackendUrl(env: EnvRecord, isProdBuild: boolean): string {
  const target = resolveApiTarget(env, isProdBuild);
  const dev = trimUrl(typeof env.VITE_DEV_BACKEND_URL === "string" ? env.VITE_DEV_BACKEND_URL : undefined);
  const prod = trimUrl(typeof env.VITE_PROD_BACKEND_URL === "string" ? env.VITE_PROD_BACKEND_URL : undefined);
  const legacy = trimUrl(typeof env.VITE_BACKEND_URL === "string" ? env.VITE_BACKEND_URL : undefined);
  if (target === "production") return prod || legacy;
  return dev || legacy;
}

export function getActiveApiTarget(): ApiTarget {
  return resolveApiTarget(import.meta.env, import.meta.env.PROD);
}

export function getResolvedNeonAuthUrl(): string {
  return resolveNeonAuthUrl(import.meta.env, import.meta.env.PROD);
}

/** Auth API base — Better Auth is mounted on the Alenio backend. */
export function getResolvedAuthBaseUrl(): string {
  return getResolvedBackendUrl();
}

export function getResolvedBackendUrl(): string {
  return resolveBackendUrl(import.meta.env, import.meta.env.PROD);
}

export function usesDevApiProxy(env: EnvRecord = import.meta.env): boolean {
  return !env.PROD && isTruthyFlag(env.VITE_DEV_API_PROXY);
}

export function getWebEnvConfigError(): string | null {
  const target = getActiveApiTarget();
  const backend = getResolvedBackendUrl();

  if (!backend) {
    return target === "production"
      ? "VITE_PROD_BACKEND_URL is not set (add it in web/.env or web/.env.production)."
      : "VITE_DEV_BACKEND_URL is not set (add it in web/.env).";
  }
  return null;
}
