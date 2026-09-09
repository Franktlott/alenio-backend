/**
 * Runs `prisma db push` against the `public` schema explicitly.
 *
 * The Neon role this app connects with has `search_path = neon_auth, public`,
 * so the unqualified DDL Prisma emits lands in `neon_auth` — a schema Neon owns
 * for its auth sync — instead of `public`, where the app's data actually lives.
 * Pushes then half-apply and eventually fail on constraints they created in the
 * wrong place, leaving the real tables behind the deployed code. Pinning
 * `?schema=public` on the connection string makes Prisma target the right
 * schema regardless of how the role's search path is configured.
 */
import { spawnSync } from "node:child_process";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("db-push: DATABASE_URL is not set");
  process.exit(1);
}

function withPublicSchema(connectionString: string): string {
  const url = new URL(connectionString);
  const current = url.searchParams.get("schema");
  if (current && current !== "public") {
    console.error(`db-push: refusing to override an explicit schema=${current}`);
    process.exit(1);
  }
  url.searchParams.set("schema", "public");
  return url.toString();
}

const result = spawnSync("bunx", ["prisma", "db", "push", "--accept-data-loss"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: withPublicSchema(raw) },
});

process.exit(result.status ?? 1);
