import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import {
  decodePersonalFeedCursor,
  getPersonalFeedPage,
} from "../lib/personal-feed";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const feedRouter = new Hono<{ Variables: Variables }>();
feedRouter.use("*", authGuard);

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(200).optional(),
});

feedRouter.get("/", zValidator("query", feedQuerySchema), async (c) => {
  const user = c.get("user")!;
  const { limit = DEFAULT_PAGE_SIZE, cursor: rawCursor } = c.req.valid("query");
  const cursor = decodePersonalFeedCursor(rawCursor);
  if (cursor === undefined) {
    return c.json(
      { error: { message: "Invalid feed cursor", code: "VALIDATION_ERROR" } },
      400,
    );
  }

  const page = await getPersonalFeedPage(prisma, user.id, {
    limit,
    cursor,
  });

  return c.json({ data: page });
});

export { feedRouter };
