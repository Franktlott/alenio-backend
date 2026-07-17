import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadSession, setTeamId as persistTeamId } from "./session";

type SessionState = {
  ready: boolean;
  token: string | null;
  teamId: string | null;
  setToken: (token: string | null) => void;
  setTeamId: (teamId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [teamId, setTeamIdState] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await loadSession();
    setToken(s.token);
    setTeamIdState(s.teamId);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setTeamId = useCallback(async (id: string | null) => {
    await persistTeamId(id);
    setTeamIdState(id);
  }, []);

  const value = useMemo(
    () => ({ ready, token, teamId, setToken, setTeamId, refresh }),
    [ready, token, teamId, setTeamId, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession requires SessionProvider");
  return ctx;
}
