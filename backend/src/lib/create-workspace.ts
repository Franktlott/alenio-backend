import { prisma } from "../prisma";
import { syncAppUserFromAuth } from "./ensure-app-user";
import type { AppUser } from "../auth";
import { isPrismaUniqueOnName, isTeamDisplayNameTaken, normalizeTeamName } from "./team-name";

function prismaCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  return (err as { code?: string }).code;
}

function prismaMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    const first = err.message.split("\n").map((l) => l.trim()).filter(Boolean)[0];
    return first?.slice(0, 240) || "Database error";
  }
  return "Database error";
}

export type CreateWorkspaceResult =
  | {
      ok: true;
      team: {
        id: string;
        name: string;
        image: string | null;
        createdAt: Date;
        _count: { members: number; tasks: number };
      };
      ownerName: string | null;
    }
  | {
      ok: false;
      status: 400 | 401 | 409 | 500;
      code: string;
      message: string;
    };

/**
 * Ensures a public.User row for this auth identity, then creates a workspace owned by them.
 * Surfaces FK / unique failures as JSON-friendly results instead of bare 500s.
 */
export async function createWorkspaceForAuthUser(opts: {
  authUser: AppUser;
  /** Preferred Prisma user id from middleware sync (may differ from auth id when matched by email). */
  preferredUserId?: string | null;
  name: string;
}): Promise<CreateWorkspaceResult> {
  const nameNorm = normalizeTeamName(opts.name);
  if (!nameNorm) {
    return { ok: false, status: 400, code: "VALIDATION_ERROR", message: "Name is required" };
  }

  if (await isTeamDisplayNameTaken(nameNorm)) {
    return {
      ok: false,
      status: 409,
      code: "TEAM_NAME_TAKEN",
      message: "A workspace with this name already exists. Pick a different name.",
    };
  }

  let ownerId = opts.preferredUserId?.trim() || null;
  let owner = ownerId
    ? await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, name: true } })
    : null;

  if (!owner) {
    const synced = await syncAppUserFromAuth(opts.authUser);
    ownerId = synced?.user.id ?? null;
    owner = ownerId
      ? await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, name: true } })
      : null;
  }

  if (!owner && opts.authUser.id?.trim()) {
    owner = await prisma.user.findUnique({
      where: { id: opts.authUser.id.trim() },
      select: { id: true, name: true },
    });
    ownerId = owner?.id ?? null;
  }

  if (!owner) {
    console.error(
      "[create-workspace] public.User missing after sync authUserId=",
      opts.authUser.id,
      "email=",
      opts.authUser.email ?? "null",
    );
    return {
      ok: false,
      status: 401,
      code: "USER_NOT_PROVISIONED",
      message: "Your account is not ready yet. Sign out and sign in again, then try creating a workspace.",
    };
  }

  let inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  while (await prisma.team.findUnique({ where: { inviteCode } })) {
    inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  try {
    const team = await prisma.team.create({
      data: {
        name: nameNorm,
        inviteCode,
        members: {
          create: { userId: owner.id, role: "owner" },
        },
      },
      select: {
        id: true,
        name: true,
        image: true,
        createdAt: true,
        _count: { select: { members: true, tasks: true } },
      },
    });

    return { ok: true, team, ownerName: owner.name };
  } catch (err) {
    if (isPrismaUniqueOnName(err)) {
      return {
        ok: false,
        status: 409,
        code: "TEAM_NAME_TAKEN",
        message: "A workspace with this name already exists. Pick a different name.",
      };
    }
    const code = prismaCode(err);
    console.error("[create-workspace] team create failed", {
      code,
      ownerId: owner.id,
      message: prismaMessage(err),
      err,
    });
    if (code === "P2003") {
      return {
        ok: false,
        status: 409,
        code: "USER_FK",
        message: "Could not create workspace — account sync issue. Sign out and sign in again.",
      };
    }
    if (code === "P2002") {
      return {
        ok: false,
        status: 409,
        code: "CONFLICT",
        message: "Could not create workspace because of a naming conflict. Try a different name.",
      };
    }
    return {
      ok: false,
      status: 500,
      code: "TEAM_CREATE_FAILED",
      message: "Could not create workspace. Please try again.",
    };
  }
}
