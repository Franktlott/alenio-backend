import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import {
  getOrganizationSignupInvitePreview,
  redeemOrganizationSignupInvite,
} from "../lib/enterprise-signup-invite";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const enterpriseInvitesPublicRouter = new Hono<{ Variables: Variables }>();

enterpriseInvitesPublicRouter.get("/:token", async (c) => {
  const { token } = c.req.param();
  const result = await getOrganizationSignupInvitePreview(token);
  if (!result) {
    return c.json({ error: { message: "Invite not found", code: "NOT_FOUND" } }, 404);
  }
  if (!result.ok) {
    const message =
      result.code === "EXPIRED" ? "This invite has expired." : "This invite is no longer valid.";
    return c.json({ error: { message, code: result.code } }, 410);
  }
  return c.json({ data: result.preview });
});

enterpriseInvitesPublicRouter.post(
  "/redeem",
  authGuard,
  zValidator("json", z.object({ token: z.string().trim().min(8).max(128) })),
  async (c) => {
    const user = c.get("user")!;
    const { token } = c.req.valid("json");
    if (!user.email) {
      return c.json({ error: { message: "Your account has no email.", code: "NO_EMAIL" } }, 400);
    }
    const result = await redeemOrganizationSignupInvite({
      token,
      userId: user.id,
      userEmail: user.email,
    });
    if (!result.ok) {
      const messages: Record<typeof result.code, string> = {
        NOT_FOUND: "Invite not found.",
        EXPIRED: "This invite has expired.",
        NOT_PENDING: "This invite was already used.",
        EMAIL_MISMATCH: "Sign in with the email address this invite was sent to.",
        WORKSPACE_FAILED: "Account linked, but the first workspace could not be created. Contact support.",
      };
      const status =
        result.code === "EMAIL_MISMATCH" ? 403 : result.code === "NOT_FOUND" ? 404 : 409;
      return c.json({ error: { message: messages[result.code], code: result.code } }, status);
    }
    return c.json({ data: result });
  },
);

export { enterpriseInvitesPublicRouter };
