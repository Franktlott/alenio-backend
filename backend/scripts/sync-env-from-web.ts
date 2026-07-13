/**
 * Sync backend/.env URL fields from web/.env (single source of truth for DB URLs).
 * Run: bun run sync-env
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadWebEnvFile,
  resolveApiTarget,
  resolveDatabaseUrl,
  webEnvFilePath,
} from "../src/lib/web-env";

const backendDir = join(import.meta.dir, "..");
const backendEnvPath = join(backendDir, ".env");

function parseBackendEnv(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return map;
}

function serializeBackendEnv(existing: Map<string, string>, updates: Record<string, string>): string {
  const merged = new Map(existing);
  for (const [key, value] of Object.entries(updates)) {
    if (value) merged.set(key, value);
  }
  // Cutover: stop writing NEON_AUTH_URL into backend/.env
  merged.delete("NEON_AUTH_URL");

  const lines: string[] = [
    "# Synced from web/.env via `bun run sync-env` — edit web/.env, then re-run sync.",
    `DATABASE_URL=${merged.get("DATABASE_URL") ?? "file:./dev.db"}`,
    `BACKEND_URL=${merged.get("BACKEND_URL") ?? "http://localhost:3000"}`,
    `PORT=${merged.get("PORT") ?? "3000"}`,
    `WEB_PUBLIC_URL=${merged.get("WEB_PUBLIC_URL") ?? "http://127.0.0.1:5173"}`,
    "",
  ];

  const syncedKeys = new Set([
    "DATABASE_URL",
    "BACKEND_URL",
    "PORT",
    "WEB_PUBLIC_URL",
    "DEV_DATABASE_URL",
    "PROD_DATABASE_URL",
    "NEON_AUTH_URL",
  ]);
  for (const [key, value] of merged) {
    if (syncedKeys.has(key)) continue;
    lines.splice(lines.length - 1, 0, `${key}=${value}`);
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}

function main(): void {
  const webPath = webEnvFilePath();
  if (!existsSync(webPath)) {
    console.error(`❌ web/.env not found at ${webPath}`);
    process.exit(1);
  }

  const web = loadWebEnvFile()!;
  const isProdRuntime = process.env.NODE_ENV === "production";
  const target = resolveApiTarget(web, isProdRuntime);

  const updates: Record<string, string> = {
    BACKEND_URL: "http://localhost:3000",
    PORT: "3000",
    WEB_PUBLIC_URL: "http://127.0.0.1:5173",
  };

  const dbUrl = resolveDatabaseUrl(web, isProdRuntime);
  if (dbUrl) {
    updates.DATABASE_URL = dbUrl;
  }

  const existing = existsSync(backendEnvPath)
    ? parseBackendEnv(readFileSync(backendEnvPath, "utf8"))
    : new Map<string, string>();

  if (!dbUrl && existing.has("DATABASE_URL")) {
    updates.DATABASE_URL = existing.get("DATABASE_URL")!;
  }

  writeFileSync(backendEnvPath, serializeBackendEnv(existing, updates), "utf8");

  console.log(`✅ backend/.env synced from web/.env (target: ${target})`);
  if (dbUrl) {
    console.log(`   DATABASE_URL=(from web/.env ${target === "production" ? "PROD" : "DEV"}_DATABASE_URL)`);
  } else {
    console.log(
      "   DATABASE_URL=unchanged — add DEV_DATABASE_URL to web/.env (Neon connection string) and re-run sync",
    );
  }
}

main();
