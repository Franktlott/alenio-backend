const SESSION_KEY_PREFIX = "alenio.go.leaderSession.";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type GoLeaderSession = {
  hubToken: string;
  userId: string;
  name: string;
  role: "owner" | "team_leader";
  verifiedAt: number;
};

function sessionKey(hubToken: string): string {
  return `${SESSION_KEY_PREFIX}${hubToken}`;
}

export function saveGoLeaderSession(
  hubToken: string,
  leader: Pick<GoLeaderSession, "userId" | "name" | "role">,
): void {
  if (typeof window === "undefined") return;
  const session: GoLeaderSession = {
    hubToken,
    ...leader,
    verifiedAt: Date.now(),
  };
  localStorage.setItem(sessionKey(hubToken), JSON.stringify(session));
}

export function loadGoLeaderSession(hubToken: string): GoLeaderSession | null {
  if (typeof window === "undefined" || !hubToken) return null;
  const raw = localStorage.getItem(sessionKey(hubToken));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GoLeaderSession;
    if (!parsed?.userId || !parsed?.name || parsed.hubToken !== hubToken) return null;
    if (Date.now() - parsed.verifiedAt > SESSION_TTL_MS) {
      clearGoLeaderSession(hubToken);
      return null;
    }
    return parsed;
  } catch {
    clearGoLeaderSession(hubToken);
    return null;
  }
}

export function clearGoLeaderSession(hubToken: string): void {
  if (typeof window === "undefined" || !hubToken) return;
  localStorage.removeItem(sessionKey(hubToken));
}

export function clearAllGoLeaderSessions(): void {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(SESSION_KEY_PREFIX)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}
