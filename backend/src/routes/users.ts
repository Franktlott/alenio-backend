import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { sendPushNotificationsStrict } from "../lib/push";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const usersRouter = new Hono<{ Variables: Variables }>();

usersRouter.use("*", authGuard);

const pushTokenSchema = z
  .object({
    pushToken: z.string().trim().min(1).max(512).nullable(),
  })
  .strict();

async function saveUserPushToken(userId: string, pushToken: string | null) {
  const cleaned = typeof pushToken === "string" ? pushToken.trim() : null;
  const next = cleaned && cleaned.length > 0 ? cleaned : null;

  if (next) {
    // One device token should only belong to one account.
    await prisma.user.updateMany({
      where: { pushToken: next, NOT: { id: userId } },
      data: { pushToken: null },
    });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { pushToken: next },
    select: { id: true, pushToken: true },
  });

  return {
    ok: true as const,
    hasToken: !!updated.pushToken,
    tokenPreview: updated.pushToken ? `${updated.pushToken.substring(0, 35)}...` : null,
  };
}

// PATCH /api/users/push-token — save or clear the authenticated user's Expo push token
usersRouter.patch("/push-token", zValidator("json", pushTokenSchema), async (c) => {
  const user = c.get("user")!;
  const { pushToken } = c.req.valid("json");

  try {
    const result = await saveUserPushToken(user.id, pushToken);
    console.log(
      `[push-token] saved user=${user.id} hasToken=${result.hasToken} preview=${result.tokenPreview ?? "null"}`,
    );
    return c.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[push-token] failed user=${user.id}:`, err);
    return c.json({ error: { message: `Failed to save push token: ${msg}`, code: "PUSH_TOKEN_SAVE_FAILED" } }, 500);
  }
});

// GET /api/users/push-status — check if current user has a saved token
usersRouter.get("/push-status", async (c) => {
  const user = c.get("user")!;
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { pushToken: true },
  });

  const token = record?.pushToken ?? null;
  return c.json({
    data: {
      hasPushToken: !!token,
      hasToken: !!token,
      tokenPreview: token ? token.substring(0, 35) + "..." : null,
    },
  });
});

// POST /api/users/push-test — send a real push notification to the current user (if token exists)
usersRouter.post("/push-test", async (c) => {
  const user = c.get("user")!;
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { pushToken: true },
  });

  const token = record?.pushToken ?? null;
  if (!token) return c.json({ data: { ok: false, error: "no_token" } });

  try {
    await sendPushNotificationsStrict([{ token, title: "Push Test", body: "Your push notifications are working!" }]);
    return c.json({ data: { ok: true, token: token.substring(0, 30) + "..." } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ data: { ok: false, error: msg } });
  }
});

export { usersRouter };
