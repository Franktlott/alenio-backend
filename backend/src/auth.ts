import { createAuthClient } from "@neondatabase/auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env";

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

type DecodedClaims = {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  picture?: string;
  exp?: number;
};

const neonAuthClient = createAuthClient(env.NEON_AUTH_URL);
const jwks = createRemoteJWKSet(new URL(`${env.NEON_AUTH_URL}/.well-known/jwks.json`));

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

type NeonLikeUser = { id?: string; email?: string | null; name?: string | null; image?: string | null };

function pickUserAndExpiryFromNeonGetSession(result: unknown): {
  user: AppUser;
  expiresAt: Date | null;
} | null {
  const r = result as {
    data?: {
      user?: NeonLikeUser;
      session?: {
        user?: NeonLikeUser;
        expiresAt?: Date | string | number | null;
        /** Supabase-shaped session from Neon’s adapter */
        expires_at?: number;
      } | null;
    } | null;
    error?: unknown;
  } | null;
  if (r?.error) return null;
  const data = r?.data;
  if (!data) return null;

  // Better Auth vanilla: `data.user`. Neon adapter mapping: `data.session.user`.
  const top = data.user;
  const nested = data.session?.user;
  const src = (top?.id ? top : null) ?? (nested?.id ? nested : null);
  const id = src?.id?.trim();
  if (!id) return null;

  const sess = data.session;
  let expiresAt: Date | null = null;
  if (sess && typeof sess === "object") {
    if (sess.expiresAt != null) {
      expiresAt =
        typeof sess.expiresAt === "string" || typeof sess.expiresAt === "number"
          ? new Date(sess.expiresAt)
          : sess.expiresAt instanceof Date
            ? sess.expiresAt
            : null;
    } else if (typeof sess.expires_at === "number") {
      expiresAt = new Date(sess.expires_at * 1000);
    }
  }

  return {
    user: {
      id,
      email: src?.email ?? null,
      name: src?.name ?? null,
      image: src?.image ?? null,
    },
    expiresAt,
  };
}

async function getSessionFromNeon(token: string): Promise<{ user: AppUser; expiresAt: Date | null } | null> {
  try {
    const result = await neonAuthClient.getSession({
      fetchOptions: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    } as never);
    const picked = pickUserAndExpiryFromNeonGetSession(result);
    if (!picked) {
      console.warn(
        "[auth] getSessionFromNeon: no user id in response (expected data.user.id or data.session.user.id). Check NEON_AUTH_URL matches the app’s Neon Auth base URL.",
      );
      return null;
    }
    return picked;
  } catch (err) {
    console.warn("[auth] getSessionFromNeon failed; check NEON_AUTH_URL matches the app’s EXPO_PUBLIC_NEON_AUTH_URL", err);
    return null;
  }
}

export async function getSessionFromHeaders(headers: Headers): Promise<{ user: AppUser; session: AppSession } | null> {
  const token = readBearerToken(headers);
  if (!token) {
    return null;
  }
  try {
    const tokenLooksLikeJwt = token.split(".").length === 3;
    if (!tokenLooksLikeJwt) {
      throw new Error("Bearer token is not JWT-shaped");
    }
    const verified = await jwtVerify(token, jwks);
    const claims = verified.payload as DecodedClaims;
    if (!claims.sub) {
      const neon = await getSessionFromNeon(token);
      if (!neon) {
        console.warn("[auth] verified JWT has no sub and getSessionFromNeon returned null");
        return null;
      }
      return {
        user: neon.user,
        session: {
          token,
          expiresAt: neon.expiresAt,
        },
      };
    }
    let userId = claims.sub;
    let email = claims.email ?? null;
    let name = claims.name ?? claims.preferred_username ?? null;
    let image = claims.picture ?? null;
    let expiresAt = claims.exp ? new Date(claims.exp * 1000) : null;
    // Neon session is the most reliable source of identity/profile across token variants.
    const neon = await getSessionFromNeon(token);
    if (neon?.user.id) {
      userId = neon.user.id;
      email = neon.user.email ?? email;
      name = neon.user.name ?? name;
      image = neon.user.image ?? image;
      expiresAt = neon.expiresAt ?? expiresAt;
    }
    return {
      user: {
        id: userId,
        email,
        name,
        image,
      },
      session: {
        token,
        expiresAt,
      },
    };
  } catch (jwtErr) {
    // Signature/issuer mismatch or non-JWS: try Neon’s session API with the same server as NEON_AUTH_URL.
    const neon = await getSessionFromNeon(token);
    if (!neon) {
      console.warn(
        "[auth] could not establish session: JWT verify failed and getSessionFromNeon returned null. Same NEON_AUTH host as the mobile app?",
        jwtErr,
      );
      return null;
    }
    return {
      user: neon.user,
      session: {
        token,
        expiresAt: neon.expiresAt,
      },
    };
  }
}

export async function verifyEmailPassword(email: string, password: string): Promise<boolean> {
  const result = await neonAuthClient.signIn.email({ email, password });
  return !result.error;
}

export async function createEmailPasswordUser(email: string, password: string, name: string): Promise<boolean> {
  const result = await neonAuthClient.signUp.email({ email, password, name });
  return !result.error;
}

type NeonEmailOtpClient = {
  emailOtp: {
    sendVerificationOtp: (input: {
      email: string;
      type: "email-verification";
    }) => Promise<{ error?: { message?: string } | null }>;
    checkVerificationOtp: (input: {
      email: string;
      otp: string;
      type: "email-verification";
    }) => Promise<{ error?: { message?: string } | null }>;
  };
};

function emailOtpClient(): NeonEmailOtpClient {
  return neonAuthClient as unknown as NeonEmailOtpClient;
}

export async function sendEmailVerificationOtp(email: string): Promise<void> {
  const result = await emailOtpClient().emailOtp.sendVerificationOtp({
    email,
    type: "email-verification",
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Could not send verification code.");
  }
}

export async function verifyEmailVerificationOtp(email: string, otp: string): Promise<void> {
  const result = await emailOtpClient().emailOtp.checkVerificationOtp({
    email,
    otp,
    type: "email-verification",
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Invalid or expired verification code.");
  }
}
