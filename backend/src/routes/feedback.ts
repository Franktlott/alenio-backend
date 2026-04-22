import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Resend } from "resend";
import { env } from "../env";

const feedbackRouter = new Hono();

feedbackRouter.post(
  "/",
  zValidator("json", z.object({
    message: z.string().min(1).max(5000),
    category: z.string().optional(),
    userName: z.string().optional(),
    userEmail: z.string().optional(),
  })),
  async (c) => {
    const { message, category, userName, userEmail } = c.req.valid("json");

    if (!env.RESEND_API_KEY) {
      return c.json({ error: { message: "Email service not configured", code: "NOT_CONFIGURED" } }, 500);
    }

    const resend = new Resend(env.RESEND_API_KEY);
    const categoryLabel = category ? `[${category}] ` : "";
    const senderInfo = userName || userEmail
      ? `<p><strong>From:</strong> ${[userName, userEmail].filter(Boolean).join(" / ")}</p>`
      : "";

    const { error } = await resend.emails.send({
      from: env.FROM_EMAIL,
      to: "info@lotttechnologies.com",
      subject: `${categoryLabel}App Feedback`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #4361EE; margin-bottom: 8px;">New App Feedback</h2>
          ${senderInfo}
          ${category ? `<p><strong>Category:</strong> ${category}</p>` : ""}
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 16px 0;" />
          <p style="white-space: pre-wrap; color: #1E293B; line-height: 1.6;">${message}</p>
        </div>
      `,
    });

    if (error) {
      return c.json({ error: { message: "Failed to send feedback", code: "SEND_ERROR" } }, 500);
    }

    return c.json({ data: { ok: true } });
  }
);

export { feedbackRouter };
