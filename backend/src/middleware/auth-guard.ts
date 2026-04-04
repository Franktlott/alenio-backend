import { createMiddleware } from "hono/factory";
import { auth } from "../auth";

type AuthVariables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const authGuard = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  await next();
});
