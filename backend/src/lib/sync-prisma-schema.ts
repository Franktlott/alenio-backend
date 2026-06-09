import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ensures Postgres matches prisma/schema.prisma (creates OneOnOneTemplate, etc.).
 * Railway preDeploy runs db push too; this covers failed preDeploy or manual deploys.
 */
export function syncPrismaSchemaOnStartup(): void {
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const result = spawnSync(
    "bunx",
    ["prisma", "db", "push", "--accept-data-loss"],
    {
      cwd: backendRoot,
      env: process.env,
      encoding: "utf-8",
    },
  );

  if (result.status !== 0) {
    console.error(
      "[startup] prisma db push failed:",
      result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`,
    );
    return;
  }

  console.log("[startup] prisma db push completed");
}
