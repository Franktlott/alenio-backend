import "@vibecodeapp/proxy"; // DO NOT REMOVE OTHERWISE VIBECODE PROXY WILL NOT WORK
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import "./env";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { sampleRouter } from "./routes/sample";
import { teamsRouter } from "./routes/teams";
import { tasksRouter } from "./routes/tasks";
import { myTasksRouter } from "./routes/my-tasks";
import { messagesRouter } from "./routes/messages";
import { dmsRouter } from "./routes/dms";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const app = new Hono<{ Variables: Variables }>();

// CORS middleware - validates origin against allowlist
const allowed = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.dev\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecodeapp\.com$/,
  /^https:\/\/[a-z0-9-]+\.vibecode\.dev$/,
  /^https:\/\/vibecode\.dev$/,
];

app.use(
  "*",
  cors({
    origin: (origin) => (origin && allowed.some((re) => re.test(origin)) ? origin : null),
    credentials: true,
  })
);

// Logging
app.use("*", logger());

// Auth session middleware - populates user/session for all routes
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.set("user", null);
    c.set("session", null);
  } else {
    c.set("user", session.user);
    c.set("session", session.session);
  }
  await next();
});

// Auth handler - use all methods and broad path matching for Better Auth
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
app.all("/api/auth/**", (c) => auth.handler(c.req.raw));

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

// File upload endpoint - proxies to Vibecode storage
app.post("/api/upload", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json({ error: { message: "No file provided", code: "VALIDATION_ERROR" } }, 400);
  }

  const storageForm = new FormData();
  storageForm.append("file", file);

  const response = await fetch("https://storage.vibecodeapp.com/v1/files/upload", {
    method: "POST",
    body: storageForm,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return c.json({ error: { message: (error as any).error || "Upload failed", code: "UPLOAD_ERROR" } }, 500);
  }

  const result = await response.json() as { file: { id: string; url: string; originalFilename: string; contentType: string; sizeBytes: number } };
  return c.json({ data: result.file });
});

// Update profile (name and/or image)
app.patch("/api/profile", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json();
  const { name, image } = body;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(image !== undefined ? { image } : {}),
    },
    select: { id: true, name: true, email: true, image: true },
  });

  return c.json({ data: updated });
});

// GET /api/users/search?q= - search users by name or email
app.get("/api/users/search", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const q = c.req.query("q")?.trim() ?? "";
  if (!q) return c.json({ data: [] });

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: user.id } }, // exclude self
        {
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
          ],
        },
      ],
    },
    select: { id: true, name: true, email: true, image: true },
    take: 20,
  });

  return c.json({ data: users });
});

// Routes
app.route("/api/sample", sampleRouter);
app.route("/api/teams", teamsRouter);
app.route("/api/teams/:teamId/tasks", tasksRouter);
app.route("/api/tasks/mine", myTasksRouter);
app.route("/api/teams/:teamId/messages", messagesRouter);
app.route("/api/dms", dmsRouter);

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  fetch: app.fetch,
};
