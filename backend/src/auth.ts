import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";
import { prisma } from "./prisma";
import { env } from "./env";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BACKEND_URL,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }: { user: { email: string }, url: string }) => {
      if (!env.RESEND_API_KEY) {
        console.warn("[auth] RESEND_API_KEY not set, skipping reset email");
        return;
      }
      const resend = new Resend(env.RESEND_API_KEY);
      await resend.emails.send({
        from: env.FROM_EMAIL,
        to: user.email,
        subject: "Reset your password",
        html: `<p>Click <a href="${url}">here</a> to reset your password. This link expires in 1 hour.</p>`,
      });
    },
  },
  trustedOrigins: [
    "vibecode://*/*",
    "exp://*/*",
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://*.dev.vibecode.run",
    "https://*.vibecode.run",
    "https://*.vibecodeapp.com",
    "https://*.vibecode.dev",
    "https://vibecode.dev",
  ],
  plugins: [
    expo(),
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      async sendVerificationOTP({ email, otp, type }: { email: string; otp: string; type: string }) {
        if (!env.RESEND_API_KEY) {
          console.warn("[auth] RESEND_API_KEY not set, skipping OTP email");
          return;
        }
        const resend = new Resend(env.RESEND_API_KEY);
        const subject = type === "email-verification"
          ? "Verify your email"
          : type === "sign-in"
          ? "Your sign-in code"
          : "Your verification code";
        const { data, error } = await resend.emails.send({
          from: env.FROM_EMAIL,
          to: email,
          subject,
          html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
              <h2 style="color: #4361EE;">Your verification code</h2>
              <p>Use the code below to verify your email address. It expires in 10 minutes.</p>
              <div style="background: #f4f4f8; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4361EE;">${otp}</span>
              </div>
              <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        });
        if (error) {
          console.error("[auth] Resend OTP email error:", JSON.stringify(error));
        } else {
          console.log("[auth] OTP email sent, id:", data?.id);
        }
      },
    }),
  ],
  advanced: {
    trustedProxyHeaders: true,
    disableCSRFCheck: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true,
    },
  },
});
