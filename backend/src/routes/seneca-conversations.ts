import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { deleteSenecaConversation } from "../lib/seneca-conversation-cleanup";
import {
  capabilityModeForScope,
  resolveConversationAccess,
} from "../lib/seneca-conversations";
import { resolveSenecaScope } from "../lib/seneca-scope";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import type { SenecaContextRef } from "../types";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const senecaConversationsRouter = new Hono<{ Variables: Variables }>();
senecaConversationsRouter.use("*", authGuard);

const contextQuerySchema = z
  .object({
    type: z.enum(["personal", "workspace"]),
    workspaceId: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === "workspace" && !value.workspaceId) {
      ctx.addIssue({
        code: "custom",
        path: ["workspaceId"],
        message: "workspaceId is required for workspace conversations",
      });
    }
    if (value.type === "personal" && value.workspaceId) {
      ctx.addIssue({
        code: "custom",
        path: ["workspaceId"],
        message: "workspaceId is not valid for personal conversations",
      });
    }
  });

senecaConversationsRouter.get(
  "/",
  zValidator("query", contextQuerySchema),
  async (c) => {
    const user = c.get("user")!;
    const query = c.req.valid("query");
    const context: SenecaContextRef =
      query.type === "workspace"
        ? { type: "workspace", workspaceId: query.workspaceId! }
        : { type: "personal" };
    const resolution = await resolveSenecaScope(user.id, context);
    if (!resolution.ok) {
      return c.json(
        { error: { message: resolution.message, code: resolution.code } },
        resolution.status,
      );
    }
    const capabilityMode = capabilityModeForScope(resolution.scope);
    const now = new Date();
    const conversations = await prisma.senecaConversation.findMany({
      where: {
        userId: user.id,
        contextType: context.type,
        teamId: context.type === "workspace" ? context.workspaceId : null,
        capabilityMode:
          capabilityMode === "manager" ? { in: ["manager", "member"] } : capabilityMode,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        contextType: true,
        capabilityMode: true,
        teamId: true,
        title: true,
        preview: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return c.json({ data: conversations });
  },
);

senecaConversationsRouter.get("/:conversationId", async (c) => {
  const user = c.get("user")!;
  const now = new Date();
  const conversation = await prisma.senecaConversation.findFirst({
    where: {
      id: c.req.param("conversationId"),
      userId: user.id,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      userId: true,
      teamId: true,
      contextType: true,
      capabilityMode: true,
      title: true,
      preview: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
      messages: {
        select: {
          id: true,
          order: true,
          role: true,
          text: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!conversation) {
    return c.json(
      { error: { message: "Conversation not found", code: "NOT_FOUND" } },
      404,
    );
  }
  const access = await resolveConversationAccess(user.id, conversation);
  if (!access.ok) {
    return c.json(
      { error: { message: access.message, code: access.code } },
      access.status,
    );
  }
  const { userId: _userId, ...data } = conversation;
  return c.json({ data });
});

senecaConversationsRouter.delete("/:conversationId", async (c) => {
  const user = c.get("user")!;
  const conversation = await prisma.senecaConversation.findFirst({
    where: {
      id: c.req.param("conversationId"),
      userId: user.id,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      userId: true,
      teamId: true,
      contextType: true,
      capabilityMode: true,
    },
  });
  if (!conversation) {
    return c.json(
      { error: { message: "Conversation not found", code: "NOT_FOUND" } },
      404,
    );
  }
  const access = await resolveConversationAccess(user.id, conversation);
  if (!access.ok) {
    return c.json(
      { error: { message: access.message, code: access.code } },
      access.status,
    );
  }
  await deleteSenecaConversation(conversation.id);
  return c.json({ data: { deleted: true, conversationId: conversation.id } });
});

export { senecaConversationsRouter };
