import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { prisma } from "../prisma";
import type { auth } from "../auth";
import { effectiveStaffRole, roleHasAbility, type StaffAbility, type StaffRole } from "../lib/staff-roles";

type AdminVariables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

type StaffContext = Context<{ Variables: AdminVariables }>;

export type StaffActor = { id: string; email: string | null; role: StaffRole };

const STAFF_KEY = "staffActor";

/** The signed-in staff member, resolved once per request. */
export async function resolveStaffActor(c: StaffContext): Promise<StaffActor | null> {
  const cached = (c as unknown as { get(key: string): unknown }).get(STAFF_KEY) as StaffActor | null | undefined;
  if (cached !== undefined) return cached;
  const user = c.get("user");
  let actor: StaffActor | null = null;
  if (user) {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, accountType: true, staffRole: true },
    });
    const role = effectiveStaffRole(row);
    actor = role ? { id: user.id, email: row?.email ?? null, role } : null;
  }
  (c as unknown as { set(key: string, value: unknown): void }).set(STAFF_KEY, actor);
  return actor;
}

/**
 * Platform admin is its own account type, not a privilege on a member login.
 * Any staff account gets past this gate; each route then checks its ability.
 */
export async function adminGuard(c: StaffContext, next: Next) {
  if (!c.get("user")) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!(await resolveStaffActor(c))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  await next();
}

function forbidden(c: StaffContext) {
  return c.json(
    { error: { message: "Your staff role doesn't allow this.", code: "STAFF_FORBIDDEN" } },
    403,
  );
}

/** Route-level check for one ability. Use after adminGuard. */
export function requireAbility(ability: StaffAbility) {
  return createMiddleware(async (c, next) => {
    const actor = await resolveStaffActor(c as StaffContext);
    if (!actor || !roleHasAbility(actor.role, ability)) return forbidden(c as StaffContext);
    await next();
  });
}

/** Reads need `view`, anything that changes data needs `edit`. */
export function requireAbilityByMethod(view: StaffAbility, edit: StaffAbility) {
  return createMiddleware(async (c, next) => {
    const method = c.req.method.toUpperCase();
    const ability = method === "GET" || method === "HEAD" ? view : edit;
    const actor = await resolveStaffActor(c as StaffContext);
    if (!actor || !roleHasAbility(actor.role, ability)) return forbidden(c as StaffContext);
    await next();
  });
}

/**
 * Logs every successful change made through a router. The summary comes from
 * the route, since these routers have many small endpoints.
 */
export function auditStaffChanges(
  targetType: "article" | "category" | "seneca" | "home_insight" | "feed_post",
  describe: (method: string, path: string) => { action: string; summary: string; targetId?: string | null },
) {
  return createMiddleware(async (c, next) => {
    await next();
    const method = c.req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || c.res.status >= 400) return;
    const actor = await resolveStaffActor(c as StaffContext);
    if (!actor) return;
    const { recordStaffAction } = await import("../lib/staff-audit");
    const entry = describe(method, new URL(c.req.url).pathname);
    await recordStaffAction({ ...entry, targetType, actorId: actor.id, actorEmail: actor.email });
  });
}
