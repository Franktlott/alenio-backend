import { Hono } from "hono";
import { env } from "../env";
import { syncOwnedTeamSubscriptionsFromRevenueCatUser } from "./subscription";

const revenueCatRouter = new Hono();

revenueCatRouter.post("/webhook", async (c) => {
  if (env.REVENUECAT_WEBHOOK_AUTH_TOKEN) {
    const authHeader = c.req.header("authorization") ?? "";
    const expected = `Bearer ${env.REVENUECAT_WEBHOOK_AUTH_TOKEN}`;
    if (authHeader !== expected) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
  }

  const body = await c.req.json().catch(() => null) as
    | {
        event?: {
          app_user_id?: string;
        };
      }
    | null;

  const appUserId = body?.event?.app_user_id?.trim();
  if (!appUserId) {
    return c.json({ data: { ok: true, ignored: true } });
  }

  try {
    const result = await syncOwnedTeamSubscriptionsFromRevenueCatUser(appUserId);
    return c.json({ data: { ok: true, ...result } });
  } catch (error) {
    console.error("[revenuecat/webhook] failed:", error);
    return c.json({ data: { ok: true, ignored: false, synced: false } });
  }
});

export { revenueCatRouter };

