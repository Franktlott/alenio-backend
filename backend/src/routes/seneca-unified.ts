import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { askMemberWorkspaceSeneca, askPersonalSeneca } from "../lib/seneca-ask-service";
import {
  senecaAskBodySchema,
  resolveSenecaQuestion,
  resolveSenecaScope,
  workspaceHasSenecaEntitlement,
  type SenecaValidatedAsk,
} from "../lib/seneca-scope";
import { getWorkspaceAccess } from "../lib/workspace-access";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import type { SenecaContextOption } from "../types";
import { handleManagerWorkspaceAsk } from "./seneca-team";
import {
  editSenecaImage,
  generateSenecaImage,
  SENECA_IMAGE_SIZES,
  SenecaImageError,
} from "../lib/seneca-image-service";
import {
  assertSenecaConversationContinuation,
  capabilityModeForScope,
  loadSenecaConversationHistory,
  saveSenecaConversationTurn,
  SenecaConversationError,
} from "../lib/seneca-conversations";
import {
  prepareSenecaAttachment,
  senecaAttachmentSchema,
  SenecaAttachmentError,
  type PreparedSenecaAttachment,
} from "../lib/seneca-attachments";
import {
  moderateSenecaImage,
  SenecaSafetyError,
} from "../lib/seneca-image-safety";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const senecaUnifiedRouter = new Hono<{ Variables: Variables }>();
senecaUnifiedRouter.use("*", authGuard);

const senecaImageBodySchema = z
  .object({
    context: senecaAskBodySchema.shape.context,
    prompt: z
      .string()
      .trim()
      .min(3, "Describe the image you want")
      .max(1000),
    size: z.enum(SENECA_IMAGE_SIZES).optional(),
    conversationId: z.string().trim().min(1).optional(),
  })
  .strict();

export const senecaImageEditBodySchema = z
  .object({
    context: senecaAskBodySchema.shape.context,
    prompt: z.string().trim().min(1, "Describe the edit you want").max(1000),
    attachment: senecaAttachmentSchema.extend({
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    }),
    conversationId: z.string().trim().min(1).optional(),
  })
  .strict();

senecaUnifiedRouter.get("/contexts", async (c) => {
  const user = c.get("user")!;
  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      teamId: true,
      team: { select: { name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
  const access = await Promise.all(
    memberships.map((membership) => getWorkspaceAccess(membership.teamId)),
  );
  const options: SenecaContextOption[] = [
    { type: "personal", name: "Personal", available: true },
    ...memberships.map((membership, index) => ({
      type: "workspace" as const,
      workspaceId: membership.teamId,
      name: membership.team.name,
      role: membership.role,
      available: workspaceHasSenecaEntitlement(access[index] ?? { hasTeamFeatures: false }),
    })),
  ];
  return c.json({ data: options });
});

senecaUnifiedRouter.post(
  "/images",
  zValidator("json", senecaImageBodySchema),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const resolution = await resolveSenecaScope(user.id, body.context);
    if (!resolution.ok) {
      return c.json(
        {
          error: {
            message: resolution.message,
            code: resolution.code,
          },
        },
        resolution.status,
      );
    }

    try {
      const scope = resolution.scope;
      const capabilityMode = capabilityModeForScope(scope);
      await assertSenecaConversationContinuation(body.conversationId, {
        userId: user.id,
        context: body.context,
        capabilityMode,
      });
      const data = await generateSenecaImage({
        userId: user.id,
        ownerType: scope.type === "workspace" ? "WORKSPACE" : "PERSONAL",
        ownerId: scope.type === "workspace" ? scope.workspaceId : user.id,
        prompt: body.prompt,
        size: body.size,
      });
      const conversationId = await saveSenecaConversationTurn({
        conversationId: body.conversationId,
        userId: user.id,
        context: body.context,
        capabilityMode,
        userText: body.prompt,
        assistantText: "Generated an image from your prompt.",
        userMetadata: { kind: "image_prompt", size: body.size ?? "1024x1024" },
        assistantMetadata: JSON.parse(JSON.stringify({ kind: "image", ...data })),
        generationId: data.generationId,
      });
      return c.json({ data: { ...data, conversationId } });
    } catch (error) {
      if (error instanceof SenecaConversationError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      if (error instanceof SenecaSafetyError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      if (error instanceof SenecaImageError) {
        return c.json(
          {
            error: {
              message: error.message,
              code: error.code,
            },
          },
          error.status,
        );
      }
      console.error("Seneca image generation error", error);
      return c.json(
        {
          error: {
            message: "Seneca could not generate that image right now.",
            code: "IMAGE_PROVIDER_ERROR",
          },
        },
        502,
      );
    }
  },
);

senecaUnifiedRouter.post(
  "/images/edit",
  zValidator("json", senecaImageEditBodySchema),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const resolution = await resolveSenecaScope(user.id, body.context);
    if (!resolution.ok) {
      return c.json(
        {
          error: {
            message: resolution.message,
            code: resolution.code,
          },
        },
        resolution.status,
      );
    }

    try {
      const scope = resolution.scope;
      const capabilityMode = capabilityModeForScope(scope);
      await assertSenecaConversationContinuation(body.conversationId, {
        userId: user.id,
        context: body.context,
        capabilityMode,
      });
      const attachment = await prepareSenecaAttachment(body.attachment, user.id);
      const data = await editSenecaImage({
        userId: user.id,
        ownerType: scope.type === "workspace" ? "WORKSPACE" : "PERSONAL",
        ownerId: scope.type === "workspace" ? scope.workspaceId : user.id,
        prompt: body.prompt,
        attachment,
      });
      const conversationId = await saveSenecaConversationTurn({
        conversationId: body.conversationId,
        userId: user.id,
        context: body.context,
        capabilityMode,
        userText: body.prompt,
        assistantText: "Edited the attached image from your instructions.",
        userMetadata: JSON.parse(
          JSON.stringify({
            kind: "attachment",
            operation: "image_edit",
            attachment: attachment.metadata,
          }),
        ),
        assistantMetadata: JSON.parse(
          JSON.stringify({ kind: "image", operation: "image_edit", ...data }),
        ),
        generationId: data.generationId,
      });
      return c.json({ data: { ...data, conversationId } });
    } catch (error) {
      if (error instanceof SenecaConversationError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      if (error instanceof SenecaAttachmentError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      if (error instanceof SenecaSafetyError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      if (error instanceof SenecaImageError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      console.error("Seneca image editing error", error);
      return c.json(
        {
          error: {
            message: "Seneca could not edit that image right now.",
            code: "IMAGE_PROVIDER_ERROR",
          },
        },
        502,
      );
    }
  },
);

senecaUnifiedRouter.post(
  "/ask",
  zValidator("json", senecaAskBodySchema),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json") as SenecaValidatedAsk;
    const resolution = await resolveSenecaScope(user.id, body.context);
    if (!resolution.ok) {
      return c.json(
        { error: { message: resolution.message, code: resolution.code } },
        resolution.status,
      );
    }
    const capabilityMode = capabilityModeForScope(resolution.scope);
    const question = resolveSenecaQuestion(body);
    let conversationMessages = body.messages;
    try {
      conversationMessages = await loadSenecaConversationHistory(
        body.conversationId,
        {
          userId: user.id,
          context: body.context,
          capabilityMode,
        },
        body.messages,
      );
    } catch (error) {
      if (error instanceof SenecaConversationError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      throw error;
    }

    let attachment: PreparedSenecaAttachment | undefined;
    if (body.attachment) {
      try {
        attachment = await prepareSenecaAttachment(body.attachment, user.id);
        if (attachment.imageDataUrl) {
          await moderateSenecaImage({
            userId: user.id,
            operation: "vision_ask_input",
            text: question,
            imageDataUrl: attachment.imageDataUrl,
            ownedGenericAttachmentUrl: attachment.metadata.url,
          });
        }
      } catch (error) {
        if (error instanceof SenecaAttachmentError) {
          return c.json(
            { error: { message: error.message, code: error.code } },
            error.status,
          );
        }
        if (error instanceof SenecaSafetyError) {
          return c.json(
            { error: { message: error.message, code: error.code } },
            error.status,
          );
        }
        throw error;
      }
    }
    const userMetadata = attachment
      ? JSON.parse(
          JSON.stringify({ kind: "attachment", attachment: attachment.metadata }),
        )
      : undefined;

    if (resolution.scope.type === "personal") {
      try {
        const data = await askPersonalSeneca(
          resolution.scope.userId,
          question,
          conversationMessages,
          prisma,
          attachment,
        );
        const conversationId = await saveSenecaConversationTurn({
          conversationId: body.conversationId,
          userId: user.id,
          context: body.context,
          capabilityMode,
          userText: question,
          assistantText: data.message,
          userMetadata,
          assistantMetadata: JSON.parse(JSON.stringify({ kind: "ask", ...data })),
        });
        return c.json({ data: { ...data, conversationId } });
      } catch (error) {
        if (error instanceof SenecaConversationError) {
          return c.json(
            { error: { message: error.message, code: error.code } },
            error.status,
          );
        }
        return c.json(
          { error: { message: error instanceof Error ? error.message : "Seneca request failed" } },
          500,
        );
      }
    }

    const teamId = resolution.scope.workspaceId;
    const capabilities = resolution.scope.capabilities;
    if (capabilities.canUseManagerContext) {
      const legacyBody = { question, messages: conversationMessages, attachment };
      const response = await handleManagerWorkspaceAsk({
        get: (key: "user" | "session") => c.get(key),
        req: {
          param: (key: string) => (key === "teamId" ? teamId : undefined),
          valid: () => legacyBody,
        },
        json: (data: unknown, status = 200) =>
          new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
      });
      if (!response.ok) return response;
      const payload = (await response.json()) as {
        data: {
          message: string;
          generationId?: string;
          [key: string]: unknown;
        };
      };
      const { generationId, ...data } = payload.data;
      try {
        const conversationId = await saveSenecaConversationTurn({
          conversationId: body.conversationId,
          userId: user.id,
          context: body.context,
          capabilityMode,
          userText: question,
          assistantText: data.message,
          userMetadata,
          assistantMetadata: JSON.parse(JSON.stringify({ kind: "ask", ...data })),
          generationId,
        });
        return c.json({ data: { ...data, conversationId } });
      } catch (error) {
        if (error instanceof SenecaConversationError) {
          return c.json(
            { error: { message: error.message, code: error.code } },
            error.status,
          );
        }
        throw error;
      }
    }

    try {
      const data = await askMemberWorkspaceSeneca(
        teamId,
        user.id,
        question,
        conversationMessages,
        prisma,
        attachment,
      );
      const { generationId, ...responseData } = data;
      const conversationId = await saveSenecaConversationTurn({
        conversationId: body.conversationId,
        userId: user.id,
        context: body.context,
        capabilityMode,
        userText: question,
        assistantText: responseData.message,
        userMetadata,
        assistantMetadata: JSON.parse(
          JSON.stringify({ kind: "ask", ...responseData }),
        ),
        generationId,
      });
      return c.json({ data: { ...responseData, conversationId } });
    } catch (error) {
      if (error instanceof SenecaConversationError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      return c.json(
        { error: { message: error instanceof Error ? error.message : "Seneca request failed" } },
        500,
      );
    }
  },
);

export { senecaUnifiedRouter };
