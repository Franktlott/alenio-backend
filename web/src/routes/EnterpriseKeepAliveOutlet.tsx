import { createContext, useContext, useEffect, useMemo, useState, type ComponentType } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ActivityPage } from "./ActivityPage";
import { AdminPage } from "./AdminPage";
import { BillingPage } from "./BillingPage";
import { ChatPage } from "./ChatPage";
import { DashboardPage } from "./DashboardPage";
import { ProfilePage } from "./ProfilePage";
import { TeamPage } from "./TeamPage";

/** True when this pane's route is the visible enterprise tab. Hidden keep-alive panes get false. */
export const EnterprisePaneActiveContext = createContext(true);

export function useEnterprisePaneActive(): boolean {
  return useContext(EnterprisePaneActiveContext);
}

type PaneId = "dashboard" | "activity" | "chat" | "team" | "billing" | "settings" | "admin";

type PaneDef = {
  id: PaneId;
  match: (pathname: string) => boolean;
  Component: ComponentType;
};

const PANES: PaneDef[] = [
  { id: "dashboard", match: (p) => p.startsWith("/dashboard"), Component: DashboardPage },
  { id: "activity", match: (p) => p.startsWith("/activity"), Component: ActivityPage },
  { id: "chat", match: (p) => p.startsWith("/chat"), Component: ChatPage },
  { id: "team", match: (p) => p.startsWith("/team"), Component: TeamPage },
  { id: "billing", match: (p) => p.startsWith("/billing"), Component: BillingPage },
  {
    id: "settings",
    match: (p) => p.startsWith("/settings") || p.startsWith("/profile"),
    Component: ProfilePage,
  },
  { id: "admin", match: (p) => p.startsWith("/admin"), Component: AdminPage },
];

function paneIdFromPath(pathname: string): PaneId | null {
  return PANES.find((pane) => pane.match(pathname))?.id ?? null;
}

/**
 * Keeps main enterprise tabs mounted after first visit so navigating away
 * does not wipe UI state or flash a full-page reload. Non-keep-alive routes
 * (Go, create task, etc.) still use the normal Outlet.
 */
export function EnterpriseKeepAliveOutlet() {
  const { pathname } = useLocation();
  const activeId = useMemo(() => paneIdFromPath(pathname), [pathname]);
  const [visited, setVisited] = useState<Set<PaneId>>(() => {
    const initial = paneIdFromPath(pathname);
    return initial ? new Set<PaneId>([initial]) : new Set<PaneId>();
  });

  useEffect(() => {
    if (!activeId) return;
    setVisited((prev) => {
      if (prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.add(activeId);
      return next;
    });
  }, [activeId]);

  return (
    <>
      {PANES.map((pane) => {
        if (!visited.has(pane.id)) return null;
        const active = activeId === pane.id;
        const Pane = pane.Component;
        return (
          <div
            key={pane.id}
            className={`enterprise-keepalive-pane${active ? " enterprise-keepalive-pane--active" : ""}`}
            aria-hidden={!active}
            data-enterprise-pane={pane.id}
            data-active={active ? "true" : "false"}
          >
            <EnterprisePaneActiveContext.Provider value={active}>
              <Pane />
            </EnterprisePaneActiveContext.Provider>
          </div>
        );
      })}
      {!activeId ? <Outlet /> : null}
    </>
  );
}
