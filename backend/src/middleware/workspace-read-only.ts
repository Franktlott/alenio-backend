import type { MiddlewareHandler } from "hono";
import {
  assertWorkspaceCanWrite,
  workspaceReadOnlyError,
} from "../lib/workspace-access";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function teamIdFromPath(path: string): string | null {
  const match = path.match(/^(?:\/web)?\/api\/teams\/([^/]+)(?:\/|$)/);
  if (!match?.[1]) return null;
  const teamId = decodeURIComponent(match[1]);
  if (!teamId || teamId === "join") return null;
  return teamId;
}

function isBillingExempt(path: string): boolean {
  return /^(?:\/web)?\/api\/teams\/[^/]+\/subscription(?:\/|$)/.test(path);
}

/** Blocks workspace mutations after a trial/subscription becomes read-only. */
export const workspaceReadOnlyMiddleware: MiddlewareHandler = async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method) || isBillingExempt(c.req.path)) {
    await next();
    return;
  }

  const teamId = teamIdFromPath(c.req.path);
  if (!teamId) {
    await next();
    return;
  }

  const guard = await assertWorkspaceCanWrite(teamId);
  if (!guard.ok) {
    return c.json(workspaceReadOnlyError(guard.access), 403);
  }
  await next();
};
