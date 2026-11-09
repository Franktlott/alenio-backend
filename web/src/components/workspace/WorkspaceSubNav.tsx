import {
  Building2,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  LayoutGrid,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { WebTeamRow } from "../../lib/api";
import { switchEnterpriseWorkspace } from "../../lib/enterprise-selected-team";
import { resolveUserImageUrl } from "../../lib/user-avatar";

export type WorkspaceSection = "overview" | "tasks" | "calendar" | "members" | "momentum";

export const WORKSPACE_SECTION_PATH: Record<WorkspaceSection, string> = {
  overview: "/workspace",
  tasks: "/workspace/tasks",
  calendar: "/workspace/calendar",
  members: "/workspace/members",
  momentum: "/workspace/momentum",
};

const ITEMS: Array<{ id: WorkspaceSection; label: string; icon: ReactNode }> = [
  { id: "overview", label: "Overview", icon: <LayoutGrid size={18} strokeWidth={2} /> },
  { id: "tasks", label: "Tasks", icon: <CheckSquare size={18} strokeWidth={2} /> },
  { id: "calendar", label: "Calendar", icon: <CalendarDays size={18} strokeWidth={2} /> },
  { id: "members", label: "Members", icon: <Users size={18} strokeWidth={2} /> },
  { id: "momentum", label: "Momentum", icon: <TrendingUp size={18} strokeWidth={2} /> },
];

export function workspaceRoleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "team_leader":
      return "Team leader";
    case "admin":
      return "Admin";
    default:
      return "Member";
  }
}

function WorkspaceMark({ team, size }: { team: WebTeamRow; size: "lg" | "sm" }) {
  const [broken, setBroken] = useState(false);
  const url = resolveUserImageUrl(team.image ?? null);
  if (url && !broken) {
    return <img src={url} alt="" className={`ws-subnav-mark ws-subnav-mark--${size}`} onError={() => setBroken(true)} />;
  }
  const initial = team.name.trim().charAt(0).toUpperCase();
  return (
    <span className={`ws-subnav-mark ws-subnav-mark--${size} ws-subnav-mark--blank`} aria-hidden>
      {initial || <Building2 size={size === "lg" ? 20 : 14} strokeWidth={2} />}
    </span>
  );
}

/** Second column beside the main rail on workspace pages: switcher plus section links. */
export function WorkspaceSubNav({
  team,
  teams,
  active,
  openTaskCount,
  onTeamChange,
  onInvite,
}: {
  team: WebTeamRow;
  teams: WebTeamRow[];
  active: WorkspaceSection;
  openTaskCount: number | null;
  onTeamChange: (teamId: string) => void;
  onInvite?: () => void;
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canSwitch = teams.length > 1;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const pick = (teamId: string) => {
    setMenuOpen(false);
    if (teamId !== team.id) switchEnterpriseWorkspace(teamId, onTeamChange);
    if (active === "members") navigate(WORKSPACE_SECTION_PATH.members);
  };

  return (
    <aside className="ws-subnav" aria-label="Workspace navigation" data-testid="ws-subnav">
      <div className="ws-subnav-switch" ref={wrapRef}>
        <button
          type="button"
          className="ws-subnav-switch-btn"
          onClick={canSwitch ? () => setMenuOpen((o) => !o) : undefined}
          aria-haspopup={canSwitch ? "menu" : undefined}
          aria-expanded={canSwitch ? menuOpen : undefined}
          disabled={!canSwitch}
          title={team.name}
          data-testid="ws-subnav-switch"
        >
          <WorkspaceMark team={team} size="lg" />
          <span className="ws-subnav-switch-copy">
            <span className="ws-subnav-switch-name">{team.name}</span>
            <span className="ws-subnav-switch-role">{workspaceRoleLabel(team.role)}</span>
          </span>
          {canSwitch ? <ChevronDown size={16} strokeWidth={2.2} className="ws-subnav-switch-chevron" /> : null}
        </button>
        {menuOpen ? (
          <div className="ws-subnav-menu" role="menu" aria-label="Switch workspace" data-testid="ws-subnav-menu">
            <p className="ws-subnav-menu-title">Switch workspace</p>
            {teams.map((t) => {
              const current = t.id === team.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  className={`ws-subnav-menu-item${current ? " ws-subnav-menu-item--on" : ""}`}
                  onClick={() => pick(t.id)}
                  data-testid={`ws-subnav-team-${t.id}`}
                >
                  <WorkspaceMark team={t} size="sm" />
                  <span className="ws-subnav-menu-copy">
                    <span className="ws-subnav-menu-name">{t.name}</span>
                    <span className="ws-subnav-menu-role">{workspaceRoleLabel(t.role)}</span>
                  </span>
                  {current ? <Check size={15} strokeWidth={2.4} className="ws-subnav-menu-check" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <nav className="ws-subnav-list">
        {ITEMS.map((item) => {
          const on = item.id === active;
          return (
            <Link
              key={item.id}
              to={WORKSPACE_SECTION_PATH[item.id]}
              className={`ws-subnav-item${on ? " ws-subnav-item--on" : ""}`}
              aria-current={on ? "page" : undefined}
              data-testid={`ws-subnav-${item.id}`}
            >
              <span className="ws-subnav-icon">{item.icon}</span>
              <span className="ws-subnav-label">{item.label}</span>
              {item.id === "tasks" && openTaskCount ? (
                <span className="ws-subnav-badge" aria-label={`${openTaskCount} open tasks assigned to you`}>
                  {openTaskCount > 99 ? "99+" : openTaskCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {onInvite ? (
        <button type="button" className="ws-subnav-invite" onClick={onInvite} data-testid="ws-subnav-invite">
          <UserPlus size={17} strokeWidth={2.2} />
          Invite people
        </button>
      ) : null}
    </aside>
  );
}
