import { Hono } from "hono";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { searchStockPhotos } from "../lib/stock-photos";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const stockPhotosRouter = new Hono<{ Variables: Variables }>();

stockPhotosRouter.use("*", authGuard);

stockPhotosRouter.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  try {
    const photos = await searchStockPhotos(q);
    return c.json({ data: { photos } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Photo search is unavailable right now.";
    return c.json({ error: { message, code: "STOCK_PHOTO_SEARCH_FAILED" } }, 502);
  }
});
