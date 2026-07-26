import { Hono } from "hono";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { listIncomingOwnershipTransfers } from "../lib/ownership-transfer";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const ownershipTransfersRouter = new Hono<{ Variables: Variables }>();

ownershipTransfersRouter.use("*", authGuard);

/** GET /api/ownership-transfers/mine — pending transfers offered to the current user */
ownershipTransfersRouter.get("/mine", async (c) => {
  const user = c.get("user")!;
  const data = await listIncomingOwnershipTransfers(user.id);
  return c.json({ data });
});

export { ownershipTransfersRouter };
