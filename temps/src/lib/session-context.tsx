import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { onUnauthorized } from "./api";
import { flushPendingSyncDrafts } from "./pending-sync";
import {
  clearSession,
  loadSession,
  setAccessToken as persistAccessToken,
  setTeamId as persistTeamId,
} from "./session";

type SessionState = {
  ready: boolean;
  token: string | null;
  teamId: string | null;
  setToken: (token: string | null) => void;
  setTeamId: (teamId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  signOutLocal: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [teamId, setTeamIdState] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await loadSession();
    setTokenState(s.token);
    setTeamIdState(s.teamId);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return onUnauthorized(() => {
      setTokenState(null);
      setTeamIdState(null);
    });
  }, []);

  useEffect(() => {
    if (!ready || !token || !teamId) return;

    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        void flushPendingSyncDrafts(teamId);
      }
    };

    const sub = AppState.addEventListener("change", onChange);
    // Also try once when session becomes ready (cold start with pending drafts).
    void flushPendingSyncDrafts(teamId);
    return () => sub.remove();
  }, [ready, token, teamId]);

  const setToken = useCallback((next: string | null) => {
    setTokenState(next);
    void persistAccessToken(next);
  }, []);

  const setTeamId = useCallback(async (id: string | null) => {
    await persistTeamId(id);
    setTeamIdState(id);
  }, []);

  const signOutLocal = useCallback(async () => {
    await clearSession();
    setTokenState(null);
    setTeamIdState(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      token,
      teamId,
      setToken,
      setTeamId,
      refresh,
      signOutLocal,
    }),
    [ready, token, teamId, setToken, setTeamId, refresh, signOutLocal],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession requires SessionProvider");
  return ctx;
}
