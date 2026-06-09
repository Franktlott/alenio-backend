import type { Context } from "hono";

export function isPrismaSchemaMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  return code === "P2021" || code === "P2022";
}

export function prismaRouteError(c: Context, err: unknown, logLabel: string) {
  if (isPrismaSchemaMissingError(err)) {
    return c.json(
      {
        error: {
          message:
            "1:1 database tables are not set up yet. Redeploy the backend — it will sync the database automatically.",
          code: "DB_NOT_READY",
        },
      },
      503,
    );
  }
  console.error(logLabel, err);
  return c.json({ error: { message: "Could not complete request.", code: "INTERNAL" } }, 500);
}
