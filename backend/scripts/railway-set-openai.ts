/**
 * Push OPENAI_API_KEY from backend/.env to Railway (prod + dev backend services).
 *
 * One-time setup:
 *   1. railway login
 *   2. railway link   (select your Alenio project)
 *   3. bun run scripts/railway-set-openai.ts
 *
 * Or set RAILWAY_TOKEN from https://railway.app/account/tokens for CI/non-interactive use.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const BACKEND_ROOT = join(import.meta.dir, "..");
const ENV_PATH = join(BACKEND_ROOT, ".env");

const SERVICES = ["Alenio Backend - Prod", "Alenio Backend - Dev"] as const;

function readOpenAiKey(): string {
  if (!existsSync(ENV_PATH)) {
    console.error("Missing backend/.env — add OPENAI_API_KEY there first.");
    process.exit(1);
  }
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!trimmed.startsWith("OPENAI_API_KEY=")) continue;
    let value = trimmed.slice("OPENAI_API_KEY=".length).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\s+/g, "");
    if (!value.startsWith("sk-") || value.length < 20) {
      console.error("OPENAI_API_KEY in backend/.env looks invalid (must start with sk-).");
      process.exit(1);
    }
    return value;
  }
  console.error("OPENAI_API_KEY not found in backend/.env");
  process.exit(1);
}

function runRailway(args: string[]): number {
  const result = spawnSync("npx", ["--yes", "@railway/cli", ...args], {
    cwd: BACKEND_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

function main(): void {
  const key = readOpenAiKey();
  console.log("Setting OPENAI_API_KEY on Railway backend services (value not printed)…\n");

  if (runRailway(["whoami"]) !== 0) {
    console.error("\nRun: railway login");
    process.exit(1);
  }

  let failed = false;
  for (const service of SERVICES) {
    console.log(`\n→ ${service}`);
    const code = runRailway(["variables", "set", `OPENAI_API_KEY=${key}`, "--service", service]);
    if (code !== 0) {
      console.error(`Failed for ${service}. Try: railway link`);
      failed = true;
    } else {
      console.log(`✓ ${service}`);
    }
  }

  if (failed) process.exit(1);
  console.log("\nDone. Redeploy both backend services, then check /health for senecaConfigured: true.");
}

main();
