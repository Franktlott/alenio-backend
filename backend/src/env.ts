import { z } from "zod";

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
  // Neon Auth
  NEON_AUTH_URL: z.string().url(),
  // Backend URL
  BACKEND_URL: z.string().default("http://localhost:3000"),
  /** Comma-separated browser origins allowed for CORS (e.g. Firebase Hosting https://your-app.web.app). Localhost is always allowed. */
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  // Build marker for quick deploy verification
  BACKEND_BUILD_MARKER: z.string().optional().default("backend-marker-2026-04-27-01"),
  // Admin Dashboard
  ADMIN_PASSWORD: z.string().optional().default("admin123"),
  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().optional().default("noreply@yourdomain.com"),
  // Mobile app deep link scheme (e.g. "alenio")
  APP_SCHEME: z.string().optional().default("alenio"),
  // Daily.co video
  DAILY_API_KEY: z.string().optional(),
  // RevenueCat subscriptions
  REVENUECAT_SECRET_KEY: z.string().optional(),
  REVENUECAT_TEAM_ENTITLEMENT_ID: z.string().optional().default("Team"),
  REVENUECAT_WEBHOOK_AUTH_TOKEN: z.string().optional(),
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
