import "@vibecodeapp/proxy"; // DO NOT REMOVE OTHERWISE VIBECODE PROXY WILL NOT WORK
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import "./env";
import { auth } from "./auth";
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
