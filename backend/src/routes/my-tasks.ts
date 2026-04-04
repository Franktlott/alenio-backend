import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const myTasksRouter = new Hono<{ Variables: Variables }>();
myTasksRouter.use("*", authGuard);

// GET /api/tasks/mine
myTasksRouter.get("/", async (c) => {
  const user = c.get("user")!;
  const { status } = c.req.query();

  const assignments = await prisma.taskAssignment.findMany({
    where: { userId: user.id },
    include: {
      task: {
        include: {
          assignments: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
          recurrenceRule: true,
          creator: { select: { id: true, name: true, email: true } },
          team: { select: { id: true, name: true } },
        },
      },
    },
  });

  let tasks = assignments.map((a) => a.task);
  if (status) tasks = tasks.filter((t) => t.status === status);
  tasks.sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  return c.json({ data: tasks });
});

export { myTasksRouter };
