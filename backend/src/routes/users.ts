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
    pushToken: z.string().trim().max(300).nullable(),
  })
  .strict();

// PATCH /api/users/push-token — save or clear the authenticated user's Expo push token
usersRouter.patch("/push-token", zValidator("json", pushTokenSchema), async (c) => {
  const user = c.get("user")!;
  const { pushToken } = c.req.valid("json");

  await prisma.user.update({
    where: { id: user.id },
    data: { pushToken: pushToken ?? null },
  });

  return c.json({ data: { ok: true } });
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

