import { Hono } from "hono";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { getCheckInTemplateLibrary } from "../lib/check-in-template-library";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const checkInTemplateLibraryRouter = new Hono<{ Variables: Variables }>();
checkInTemplateLibraryRouter.use("*", authGuard);

// GET /api/check-in-template-library
checkInTemplateLibraryRouter.get("/", (c) => {
  return c.json({ data: getCheckInTemplateLibrary() });
});

export { checkInTemplateLibraryRouter };
