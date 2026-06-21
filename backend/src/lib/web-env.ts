import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type EnvRecord = Record<string, string>;

export type ApiTarget = "development" | "production";

function trimUrl(v: string | undefined): string {
  return v?.trim().replace(/\/+$/, "") ?? "";
}

/** Which backend/auth pair is active (mirrors web/src/lib/env-config.ts). */
export function resolveApiTarget(env: EnvRecord, isProdRuntime: boolean): ApiTarget {
  if (isProdRuntime) return "production";
  const t = env.VITE_API_TARGET?.trim().toLowerCase() ?? "";
  if (t === "production" || t === "prod") return "production";
  return "development";
}

export function resolveNeonAuthUrl(env: EnvRecord, isProdRuntime: boolean): string {
  const target = resolveApiTarget(env, isProdRuntime);
  const dev = trimUrl(env.VITE_DEV_NEON_AUTH_URL);
  const prod = trimUrl(env.VITE_PROD_NEON_AUTH_URL);
  const legacy = trimUrl(env.VITE_NEON_AUTH_URL);
  if (target === "production") return prod || legacy;
  return dev || legacy;
}

export function resolveDatabaseUrl(env: EnvRecord, isProdRuntime: boolean): string {
  const target = resolveApiTarget(env, isProdRuntime);
  const dev = trimUrl(env.DEV_DATABASE_URL);
  const prod = trimUrl(env.PROD_DATABASE_URL);
  if (target === "production") return prod || dev;
  return dev || prod;
}

function parseDotEnv(content: string): EnvRecord {
  const out: EnvRecord = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Path to web/.env relative to this repo layout. */
export function webEnvFilePath(): string {
  return join(import.meta.dir, "../../../web/.env");
}

export function loadWebEnvFile(): EnvRecord | null {
  const path = webEnvFilePath();
  if (!existsSync(path)) return null;
  return parseDotEnv(readFileSync(path, "utf8"));
}

/**
 * Apply URL-related env from web/.env (same source as the web app).
 * Railway/production deploys use platform env vars; this only runs when web/.env exists locally.
 */
export function applyEnvFromWeb(): void {
  const web = loadWebEnvFile();
  if (!web) return;

  const isProdRuntime = process.env.NODE_ENV === "production";
  const authUrl = resolveNeonAuthUrl(web, isProdRuntime);
  if (authUrl) {
    process.env.NEON_AUTH_URL = authUrl;
  }

  const dbUrl = resolveDatabaseUrl(web, isProdRuntime);
  if (dbUrl) {
    process.env.DATABASE_URL = dbUrl;
  }

  // Optional: allow OPENAI_API_KEY in web/.env for local dev (never commit web/.env).
  if (!process.env.OPENAI_API_KEY?.trim()) {
    const openAi = web.OPENAI_API_KEY?.trim();
    if (openAi) process.env.OPENAI_API_KEY = openAi;
  }
}
