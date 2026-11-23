import { Hono } from "hono";
import { auth } from "../auth";
import { loadResolvedHomeWorkspace } from "../lib/home-workspace-schedule";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const homeWorkspaceRouter = new Hono<{ Variables: Variables }>();

homeWorkspaceRouter.use("*", authGuard);

/** Live Alenio Workspace promo card for no-workspace Home. */
homeWorkspaceRouter.get("/", async (c) => {
  c.header("Cache-Control", "private, no-cache");
  const resolved = await loadResolvedHomeWorkspace();
  return c.json({ data: resolved });
});
