/**
 * Better Auth session verification + server helpers (Phase 5 cutover).
 * Neon Auth JWT / hosted client path removed — clients use `/api/auth/*` only.
 */
import { env } from "./env";
import { isAuthServerEnabled, loadAuthServer } from "./lib/better-auth";

export type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
  image?: string | null;
};

export type AppSession = {
  token: string;
  expiresAt: Date | null;
};

// Keep this shape for existing route type inference usage.
export const auth = {
  $Infer: {
    Session: {
      user: {} as AppUser,
      session: {} as AppSession,
    },
  },
} as const;

function readBearerToken(headers: Headers): string | null {
  const authHeader = headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token?.length ? token : null;
}

async function getSessionFromBetterAuth(
  headers: Headers,
): Promise<{ user: AppUser; session: AppSession } | null> {
  if (!isAuthServerEnabled) return null;
  const server = await loadAuthServer();
  if (!server) return null;
  const result = await server.getSessionFromHeaders(headers);
  if (!result) return null;
  const token = result.token ?? readBearerToken(headers);
  if (!token) return null;
  return {
    user: result.user,
    session: {
      token,
      expiresAt: result.expiresAt,
    },
  };
}

/** Accept Better Auth bearer sessions (opaque tokens from the bearer plugin). */
export async function getSessionFromHeaders(headers: Headers): Promise<{ user: AppUser; session: AppSession } | null> {
  const token = readBearerToken(headers);
  if (!token) return null;
  return getSessionFromBetterAuth(headers);
}

export async function verifyEmailPassword(email: string, password: string): Promise<boolean> {
  const server = await loadAuthServer();
  if (!server) return false;
  return server.verifyEmailPassword(email, password);
}

export async function createEmailPasswordUser(email: string, password: string, name: string): Promise<boolean> {
  const server = await loadAuthServer();
  if (!server) return false;
  return server.createEmailPasswordUser(email, password, name);
}

export async function sendEmailVerificationOtp(email: string): Promise<void> {
  const server = await loadAuthServer();
  if (!server) {
    throw new Error("Auth server is not available.");
  }
  await server.sendEmailVerificationOtp(email);
}

export async function verifyEmailVerificationOtp(email: string, otp: string): Promise<void> {
  const server = await loadAuthServer();
  if (!server) {
    throw new Error("Auth server is not available.");
  }
  await server.verifyEmailVerificationOtp(email, otp);
}
