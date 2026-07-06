import type { Context, Next } from "hono";
import { prisma } from "../prisma";
import type { auth } from "../auth";

type AdminVariables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

/** Requires an authenticated session and `User.isAdmin === true`. */
export async function adminGuard(c: Context<{ Variables: AdminVariables }>, next: Next) {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isAdmin: true },
  });

  if (!fullUser?.isAdmin) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  await next();
}
