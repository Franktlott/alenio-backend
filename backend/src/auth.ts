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

async function getSessionFromNeon(token: string): Promise<{ user: AppUser; expiresAt: Date | null } | null> {
  try {
    const result = await neonAuthClient.getSession({
      fetchOptions: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    } as never);
    const data = result.data as
      | {
          user?: { id?: string; email?: string | null; name?: string | null; image?: string | null };
          session?: { expiresAt?: Date | string | null };
        }
      | null
      | undefined;
    const userId = data?.user?.id;
    if (!userId) {
      console.warn("[auth] getSessionFromNeon: response had no user id (token present but not recognized on this Neon Auth project?)");
      return null;
    }
    return {
      user: {
        id: userId,
        email: data?.user?.email ?? null,
        name: data?.user?.name ?? null,
        image: data?.user?.image ?? null,
      },
      expiresAt: data?.session?.expiresAt ? new Date(data.session.expiresAt) : null,
    };
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
