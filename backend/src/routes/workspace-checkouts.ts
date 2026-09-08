import { Hono } from "hono";
import { auth } from "../auth";
import { prisma } from "../prisma";
import { authGuard } from "../middleware/auth-guard";
import { createPendingWorkspaceCheckout } from "../lib/pending-workspace-checkout";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const workspaceCheckoutsRouter = new Hono<{ Variables: Variables }>();
workspaceCheckoutsRouter.use("*", authGuard);

workspaceCheckoutsRouter.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    industry?: string;
    location?: string;
    plan?: string;
  };
  const result = await createPendingWorkspaceCheckout({
    userId: user.id,
    userEmail: user.email,
    name: body.name ?? "",
    industry: body.industry,
    location: body.location,
    plan: body.plan === "operations" ? "operations" : "pro",
  });
  if (!result.ok) {
    return c.json({ error: { code: result.code, message: result.message } }, result.status);
  }
  return c.json(
    {
      data: {
        checkoutId: result.checkoutId,
        url: result.url,
        expiresAt: result.expiresAt,
      },
    },
    201,
  );
});

workspaceCheckoutsRouter.get("/:checkoutId", async (c) => {
  const user = c.get("user")!;
  const checkoutId = c.req.param("checkoutId");
  const checkout = await prisma.pendingWorkspaceCheckout.findFirst({
    where: { id: checkoutId, userId: user.id },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          industry: true,
          location: true,
          image: true,
          timezone: true,
          inviteCode: true,
          createdAt: true,
          _count: {
            select: {
              members: true,
              tasks: { where: { kind: "workspace_task" } },
            },
          },
        },
      },
    },
  });
  if (!checkout) {
    return c.json({ error: { code: "NOT_FOUND", message: "Workspace checkout not found." } }, 404);
  }

  let status = checkout.status;
  if (["pending", "awaiting_payment"].includes(status) && checkout.expiresAt.getTime() <= Date.now()) {
    await prisma.pendingWorkspaceCheckout.update({
      where: { id: checkout.id },
      data: { status: "expired", nameKey: null },
    });
    status = "expired";
  }
  return c.json({
    data: {
      checkoutId: checkout.id,
      status: ["processing", "awaiting_payment"].includes(status) ? "pending" : status,
      teamId: checkout.teamId,
      team: checkout.team ? { ...checkout.team, role: "owner" as const } : null,
    },
  });
});

export { workspaceCheckoutsRouter };
