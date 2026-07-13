import { z } from "zod";
import { applyEnvFromWeb } from "./lib/web-env";

/** Pull NEON_AUTH_URL / DATABASE_URL from web/.env when present (same URLs as the web app). */
applyEnvFromWeb();

/**
 * Environment variable schema using Zod
 * This ensures all required environment variables are present and valid
 */
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().optional().default("3000"),
  NODE_ENV: z.string().optional(),
  // Database
  DATABASE_URL: z.string().default("file:./dev.db"),
  // Neon Auth (retire after Better Auth cutover)
  NEON_AUTH_URL: z.string().url(),
  /** Optional: delete auth users via Neon Management API (see Neon Console → API keys, project/branch IDs). */
  NEON_API_KEY: z.string().optional(),
  NEON_PROJECT_ID: z.string().optional(),
  NEON_BRANCH_ID: z.string().optional(),
  /**
   * Self-hosted Better Auth secret (32+ chars). When set with a Postgres DATABASE_URL,
   * the API mounts `/api/auth/*` against the `neon_auth` schema after boot.
   */
  BETTER_AUTH_SECRET: z.string().optional(),
  // Backend URL
  BACKEND_URL: z.string().default("http://localhost:3000"),
  /** Comma-separated browser origins allowed for CORS (e.g. Firebase Hosting https://your-app.web.app). Localhost is always allowed. */
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  // Build marker for quick deploy verification
  BACKEND_BUILD_MARKER: z.string().optional().default("backend-marker-2026-07-12-better-auth-phase1d"),
  // Admin Dashboard
  ADMIN_PASSWORD: z.string().optional().default("admin123"),
  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().optional().default("noreply@alenio.com"),
  // Mobile app deep link scheme (e.g. "alenio")
  APP_SCHEME: z.string().optional().default("alenio"),
  /** Optional: linked from team invite emails */
  IOS_APP_STORE_URL: z.string().optional(),
  ANDROID_PLAY_STORE_URL: z.string().optional(),
  // Daily.co video
  DAILY_API_KEY: z.string().optional(),
  /** Optional: web Team checkout and customer portal (secret key and price id below) */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Recurring price ID for the Team plan (from your payment provider dashboard) */
  STRIPE_TEAM_PRICE_ID: z.string().optional(),
  /**
   * Public origin of the enterprise web app (no trailing slash), e.g. https://your-app.web.app
   * Used for Checkout / Portal return URLs. Local dev: http://127.0.0.1:5173
   */
  WEB_PUBLIC_URL: z.string().optional(),
  // Twilio SMS
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  // Firebase Storage (optional; required for /api/upload)
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  /** OpenAI API key for Seneca coaching assistant (optional; Seneca features disabled without it). */
  OPENAI_API_KEY: z.string().optional(),
  /** OpenAI model for Seneca (default gpt-4o-mini). */
  OPENAI_MODEL: z.string().optional().default("gpt-4o-mini"),
  /** Microsoft Outlook calendar sync (optional). */
  MICROSOFT_CALENDAR_CLIENT_ID: z.string().optional(),
  MICROSOFT_CALENDAR_CLIENT_SECRET: z.string().optional(),
  /** 32+ char secret for encrypting OAuth refresh tokens at rest. */
  CALENDAR_TOKEN_ENCRYPTION_KEY: z.string().optional(),
});

/**
 * Validate and parse environment variables
 */
function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);
    console.log("✅ Environment variables validated successfully");
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment variable validation failed:");
      error.issues.forEach((err: any) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      console.error("\nPlease check your .env file and ensure all required variables are set.");
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Validated and typed environment variables
 */
export const env = validateEnv();

/**
 * Type of the validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Extend process.env with our environment variables
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // eslint-disable-next-line import/namespace
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
