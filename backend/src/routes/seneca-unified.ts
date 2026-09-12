import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { askMemberWorkspaceSeneca, askPersonalSeneca } from "../lib/seneca-ask-service";
import {
  senecaAskBodySchema,
  senecaContextRefSchema,
  resolveSenecaQuestion,
  listSenecaContextOptions,
  type SenecaValidatedAsk,
} from "../lib/seneca-scope";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import { handleManagerWorkspaceAsk } from "./seneca-team";
import {
  editSenecaImage,
  generateSenecaImage,
  SENECA_IMAGE_SIZES,
  SenecaImageError,
} from "../lib/seneca-image-service";
import {
  loadSenecaConversationHistory,
  saveSenecaConversationTurn,
  SenecaConversationError,
  withResolvedScopeMetadata,
} from "../lib/seneca-conversations";
import {
  resolveSenecaRequestScope,
  resolvedContextPayload,
} from "../lib/seneca-request-context";
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
    context: senecaContextRefSchema.optional(),
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
    context: senecaContextRefSchema.optional(),
    prompt: z.string().trim().min(1, "Describe the edit you want").max(1000),
    attachment: senecaAttachmentSchema.extend({
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    }),
    conversationId: z.string().trim().min(1).optional(),
  })
  .strict();

function continuationExpected(
  userId: string,
  request: {
    unified: boolean;
    context: { type: "personal" } | { type: "workspace"; workspaceId: string };
    capabilityMode: "personal" | "member" | "manager";
  },
) {
  return request.unified
    ? { userId, unified: true as const }
    : {
        userId,
        context: request.context,
        capabilityMode: request.capabilityMode,
      };
}

senecaUnifiedRouter.get("/contexts", async (c) => {
  const user = c.get("user")!;
  const options = await listSenecaContextOptions(user.id);
  return c.json({ data: options });
});

senecaUnifiedRouter.post(
  "/images",
  zValidator("json", senecaImageBodySchema),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    try {
      const request = await resolveSenecaRequestScope({
        userId: user.id,
        question: body.prompt,
        conversationId: body.conversationId,
        hint: body.context,
        preferLastOnClarify: true,
      });
      if (!request.ok) {
        return c.json(
          { error: { message: request.message, code: request.code } },
          request.status,
        );
      }
      if (request.kind === "clarify") {
        return c.json(
          {
            error: {
              message: request.prompt,
              code: "CONTEXT_REQUIRED",
              clarify: { prompt: request.prompt, options: request.clarifyOptions },
            },
          },
          400,
        );
      }
      const scope = request.scope;
      await loadSenecaConversationHistory(
        body.conversationId,
        continuationExpected(user.id, request),
        [],
      );
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
        context: request.context,
        capabilityMode: request.capabilityMode,
        userText: body.prompt,
        assistantText: "Generated an image from your prompt.",
        userMetadata: withResolvedScopeMetadata(
          { kind: "image_prompt", size: body.size ?? "1024x1024" },
          request.context,
          request.capabilityMode,
        ),
        assistantMetadata: withResolvedScopeMetadata(
          JSON.parse(JSON.stringify({ kind: "image", ...data })),
          request.context,
          request.capabilityMode,
        ),
        generationId: data.generationId,
      });
      return c.json({
        data: {
          ...data,
          conversationId,
          resolvedContext: resolvedContextPayload(request.context, request.name),
        },
      });
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
    try {
      const request = await resolveSenecaRequestScope({
        userId: user.id,
        question: body.prompt,
        conversationId: body.conversationId,
        hint: body.context,
        preferLastOnClarify: true,
      });
      if (!request.ok) {
        return c.json(
          { error: { message: request.message, code: request.code } },
          request.status,
        );
      }
      if (request.kind === "clarify") {
        return c.json(
          {
            error: {
              message: request.prompt,
              code: "CONTEXT_REQUIRED",
              clarify: { prompt: request.prompt, options: request.clarifyOptions },
            },
          },
          400,
        );
      }
      const scope = request.scope;
      await loadSenecaConversationHistory(
        body.conversationId,
        continuationExpected(user.id, request),
        [],
      );
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
        context: request.context,
        capabilityMode: request.capabilityMode,
        userText: body.prompt,
        assistantText: "Edited the attached image from your instructions.",
        userMetadata: withResolvedScopeMetadata(
          JSON.parse(
            JSON.stringify({
              kind: "attachment",
              operation: "image_edit",
              attachment: attachment.metadata,
            }),
          ),
          request.context,
          request.capabilityMode,
        ),
        assistantMetadata: withResolvedScopeMetadata(
          JSON.parse(
            JSON.stringify({ kind: "image", operation: "image_edit", ...data }),
          ),
          request.context,
          request.capabilityMode,
        ),
        generationId: data.generationId,
      });
      return c.json({
        data: {
          ...data,
          conversationId,
          resolvedContext: resolvedContextPayload(request.context, request.name),
        },
      });
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
          {
            error: {
              message: error.message,
              code: error.code,
            },
          },
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
    const question = resolveSenecaQuestion(body);
    let request: Awaited<ReturnType<typeof resolveSenecaRequestScope>>;
    try {
      request = await resolveSenecaRequestScope({
        userId: user.id,
        question,
        conversationId: body.conversationId,
        hint: body.context,
      });
    } catch (error) {
      if (error instanceof SenecaConversationError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      throw error;
    }
    if (!request.ok) {
      return c.json(
        { error: { message: request.message, code: request.code } },
        request.status,
      );
    }

    let conversationMessages = body.messages;
    try {
      if (request.kind === "clarify") {
        conversationMessages = await loadSenecaConversationHistory(
          body.conversationId,
          { userId: user.id, unified: true },
          body.messages,
        );
      } else {
        conversationMessages = await loadSenecaConversationHistory(
          body.conversationId,
          continuationExpected(user.id, request),
          body.messages,
        );
      }
    } catch (error) {
      if (error instanceof SenecaConversationError) {
        return c.json(
          { error: { message: error.message, code: error.code } },
          error.status,
        );
      }
      throw error;
    }

    if (request.kind === "clarify") {
      try {
        const conversationId = await saveSenecaConversationTurn({
          conversationId: body.conversationId,
          userId: user.id,
          context: { type: "personal" },
          capabilityMode: "personal",
          userText: question,
          assistantText: request.prompt,
          assistantMetadata: {
            kind: "clarify",
            options: request.clarifyOptions,
          },
        });
        return c.json({
          data: {
            available: true,
            message: request.prompt,
            insights: [],
            suggestedActions: [],
            planOneOnOne: null,
            cancelOneOnOne: null,
            createTask: null,
            conversationId,
            clarify: {
              prompt: request.prompt,
              options: request.clarifyOptions,
            },
          },
        });
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
    const userMetadata = withResolvedScopeMetadata(
      attachment
        ? JSON.parse(
            JSON.stringify({ kind: "attachment", attachment: attachment.metadata }),
          )
        : undefined,
      request.context,
      request.capabilityMode,
    );
    const resolvedContext = resolvedContextPayload(request.context, request.name);

    if (request.scope.type === "personal") {
      try {
        const data = await askPersonalSeneca(
          request.scope.userId,
          question,
          conversationMessages,
          prisma,
          attachment,
        );
        const conversationId = await saveSenecaConversationTurn({
          conversationId: body.conversationId,
          userId: user.id,
          context: request.context,
          capabilityMode: request.capabilityMode,
          userText: question,
          assistantText: data.message,
          userMetadata,
          assistantMetadata: withResolvedScopeMetadata(
            JSON.parse(JSON.stringify({ kind: "ask", ...data })),
            request.context,
            request.capabilityMode,
          ),
        });
        return c.json({ data: { ...data, conversationId, resolvedContext } });
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

    const teamId = request.scope.workspaceId;
    const capabilities = request.scope.capabilities;
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
          context: request.context,
          capabilityMode: request.capabilityMode,
          userText: question,
          assistantText: data.message,
          userMetadata,
          assistantMetadata: withResolvedScopeMetadata(
            JSON.parse(JSON.stringify({ kind: "ask", ...data })),
            request.context,
            request.capabilityMode,
          ),
          generationId,
        });
        return c.json({ data: { ...data, conversationId, resolvedContext } });
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
        context: request.context,
        capabilityMode: request.capabilityMode,
        userText: question,
        assistantText: responseData.message,
        userMetadata,
        assistantMetadata: withResolvedScopeMetadata(
          JSON.parse(JSON.stringify({ kind: "ask", ...responseData })),
          request.context,
          request.capabilityMode,
        ),
        generationId,
      });
      return c.json({ data: { ...responseData, conversationId, resolvedContext } });
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
