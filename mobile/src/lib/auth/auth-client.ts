import { createAuthClient } from "@neondatabase/auth";

const neonAuthUrl = process.env.EXPO_PUBLIC_NEON_AUTH_URL;

if (!neonAuthUrl) {
  throw new Error("Missing EXPO_PUBLIC_NEON_AUTH_URL");
}

export const authClient = createAuthClient(neonAuthUrl);

type SessionShape = {
  session?: {
    accessToken?: string;
    access_token?: string;
    token?: string;
  } | null;
};

export async function getAccessToken(): Promise<string | null> {
  const result = await authClient.getSession();
  const data = (result?.data ?? null) as SessionShape | null;
  const session = data?.session;
  return session?.accessToken ?? session?.access_token ?? session?.token ?? null;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
