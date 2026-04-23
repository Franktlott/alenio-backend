import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { emailOTP } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Resend } from "resend";
import { prisma } from "./prisma";
import { env } from "./env";

// Embed logos as base64 so they always display regardless of email client image blocking
const alenioLogoB64 = Buffer.from(await Bun.file(`${import.meta.dir}/../static/alenio-logo.png`).arrayBuffer()).toString("base64");
const lotttechLogoB64 = Buffer.from(await Bun.file(`${import.meta.dir}/../static/lotttech-logo.png`).arrayBuffer()).toString("base64");
const alenioLogoSrc = `data:image/png;base64,${alenioLogoB64}`;
const lotttechLogoSrc = `data:image/png;base64,${lotttechLogoB64}`;

const sendEmail = async (to: string, subject: string, html: string) => {
  if (!env.RESEND_API_KEY) {
    console.warn("[auth] RESEND_API_KEY not set, skipping email");
    return;
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: env.FROM_EMAIL, to, subject, html });
  if (error) console.error("[auth] Email error:", JSON.stringify(error));
  else console.log("[auth] Email sent, id:", data?.id);
};

const emailCard = (label: string, title: string, body: string, ctaHtml: string, _backendUrl: string) => {
  const logoUrl = alenioLogoSrc;
  const lotttechLogoUrl = lotttechLogoSrc;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EEF2FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#EEF2FF" style="background:#EEF2FF;padding:32px 16px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;">
        <tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 32px rgba(67,97,238,0.12);">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:40px 40px 24px;">
              <img src="${logoUrl}" alt="Alenio" width="220" style="height:auto;display:block;margin:0 auto 14px;border:0;" />
              <p style="margin:0;font-size:15px;font-weight:700;letter-spacing:0.3px;">
                <span style="color:#4361EE;">Connect.</span><span style="color:#7C3AED;"> Execute.</span><span style="color:#EC4899;"> Celebrate.</span>
              </p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:0 20px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#2D4FD6" style="background:#2D4FD6;border-radius:18px;">
                <tr><td style="padding:24px 24px 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                    <tr>
                      <td width="30" style="border-top:1px solid rgba(255,255,255,0.3);font-size:0;">&nbsp;</td>
                      <td style="padding:0 10px;white-space:nowrap;font-size:10px;font-weight:700;color:#A5B4FC;text-transform:uppercase;letter-spacing:1.5px;text-align:center;">${label}</td>
                      <td style="border-top:1px solid rgba(255,255,255,0.3);font-size:0;">&nbsp;</td>
                    </tr>
                  </table>
                  <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#ffffff;line-height:1.25;">${title}</p>
                  <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.65);">${body}</p>
                  ${ctaHtml}
                </td></tr>
              </table>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:20px 28px 8px;">
              <p style="margin:0;font-size:12px;color:#94A3B8;">🕐 This code expires in 10 minutes.</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:16px 28px 20px;border-top:1px solid #F1F5F9;">
              <img src="${lotttechLogoUrl}" alt="Lott Technology Group" height="60" style="height:60px;width:auto;display:inline-block;border:0;" />
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0 28px 24px;">
              <p style="margin:0;font-size:12px;color:#94A3B8;">🔒 End-to-end encrypted</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BACKEND_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }: { user: { email: string }, url: string }) => {
      // Extract token and build a deep link that opens the app directly
      let resetUrl = url;
      try {
        const parsed = new URL(url);
        const token = parsed.searchParams.get("token") ?? parsed.pathname.split("/").pop();
        if (token && token.length > 10) {
          resetUrl = `${env.APP_SCHEME}://reset-password?token=${encodeURIComponent(token)}`;
        }
      } catch {
        // fall back to original URL
      }
      const cta = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr><td align="center" bgcolor="#5B7FFF" style="background:#5B7FFF;border-radius:13px;">
          <a href="${resetUrl}" style="display:block;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:15px 0;text-align:center;border-radius:13px;">Reset Password</a>
        </td></tr>
      </table>`;
      await sendEmail(
        user.email,
        "Reset your Alenio password",
        emailCard("Password Reset", "Reset your password", "Click the button below to choose a new password for your account.", cta, env.BACKEND_URL)
      );
    },
  },
  trustedOrigins: [
    "vibecode://*",
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
      sendVerificationOTP: async ({ email, otp }: { email: string; otp: string; type: string }) => {
        const cta = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
          <tr><td align="center" bgcolor="#1E293B" style="background:#1E293B;border-radius:13px;padding:20px;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#A5B4FC;text-transform:uppercase;letter-spacing:2px;">Your verification code</p>
            <p style="margin:0;font-size:40px;font-weight:800;color:#ffffff;letter-spacing:12px;">${otp}</p>
          </td></tr>
        </table>`;
        await sendEmail(
          email,
          "Your Alenio verification code",
          emailCard("Email Verification", "Verify your email", "Enter this code in the Alenio app to verify your email address.", cta, env.BACKEND_URL)
        );
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
