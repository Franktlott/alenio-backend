import { Hono } from "hono";
import { auth } from "../auth";
import { loadResolvedHomeInsights } from "../lib/home-insight-schedule";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const homeInsightsRouter = new Hono<{ Variables: Variables }>();

homeInsightsRouter.use("*", authGuard);

/** Active deck + which card is live now (server-owned schedule). */
homeInsightsRouter.get("/", async (c) => {
  c.header("Cache-Control", "private, no-cache");
  const resolved = await loadResolvedHomeInsights();
  return c.json({
    data: {
      ...resolved,
      /** @deprecated Prefer `data.cards` — kept for older clients. */
      items: resolved.cards.filter((card) => card.isActive),
    },
  });
});
