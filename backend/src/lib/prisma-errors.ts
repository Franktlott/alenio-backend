import type { Context } from "hono";
import { prisma } from "../prisma";
import { ensureWalksSchema } from "./ensure-walks-schema";

export function isPrismaSchemaMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  return code === "P2021" || code === "P2022";
}

let walksSchemaHealInFlight: Promise<unknown> | null = null;

/** Re-run Walk table sync once when Prisma reports missing relation/column. */
export async function healWalksSchemaIfNeeded(err: unknown): Promise<boolean> {
  if (!isPrismaSchemaMissingError(err)) return false;
  if (!walksSchemaHealInFlight) {
    walksSchemaHealInFlight = ensureWalksSchema(prisma).finally(() => {
      walksSchemaHealInFlight = null;
    });
  }
  const result = await walksSchemaHealInFlight;
  return Boolean(result && typeof result === "object" && "ok" in result && (result as { ok: boolean }).ok);
}

export function prismaRouteError(c: Context, err: unknown, logLabel: string) {
  if (isPrismaSchemaMissingError(err)) {
    // Fire-and-forget heal so the next request succeeds after sync.
    void healWalksSchemaIfNeeded(err);
    return c.json(
      {
        error: {
          message:
            "Database tables are not set up yet. Refresh in a moment — the backend is syncing them now.",
          code: "DB_NOT_READY",
        },
      },
      503,
    );
  }
  console.error(logLabel, err);
  return c.json({ error: { message: "Could not complete request.", code: "INTERNAL" } }, 500);
}
