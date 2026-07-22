import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { WebMeUser, WebTeamRow } from "../lib/api";

export type EnterpriseShellContextValue = {
  me: WebMeUser | null | undefined;
  setMe: Dispatch<SetStateAction<WebMeUser | null | undefined>>;
  teams: WebTeamRow[] | null;
  setTeams: Dispatch<SetStateAction<WebTeamRow[] | null>>;
  selectedTeamId: string;
  setSelectedTeamId: Dispatch<SetStateAction<string>>;
  setWorkspaceMainLoading: (v: boolean) => void;
  /**
   * Full-screen SSO-style boot while an enterprise workspace opens and sidebar tabs
   * settle to that workspace's allowed nav.
   */
  beginEnterpriseWorkspaceBoot: (teamId: string) => void;
  refreshMeAndTeams: () => Promise<void>;
  /** Extra `main` class on the enterprise shell (cleared on route change). */
  setShellMainClassSuffix: (v: string) => void;
  /** Extra `enterprise-content` class (cleared on route change). */
  setShellContentClassSuffix: (v: string) => void;
};

export const EnterpriseShellContext = createContext<EnterpriseShellContextValue | null>(null);

export function useEnterpriseShell(): EnterpriseShellContextValue {
  const v = useContext(EnterpriseShellContext);
  if (!v) throw new Error("useEnterpriseShell must be used inside EnterpriseShellLayout");
  return v;
}
