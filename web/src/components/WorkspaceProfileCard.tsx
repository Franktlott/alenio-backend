import type { WebTeamRow } from "../lib/api";

type Props = {
  team: WebTeamRow;
  isCurrent: boolean;
  variant?: "compact" | "list";
  copiedTeamId: string | null;
  workspaceMenuId: string | null;
  leaveId: string | null;
  onCopyInvite: (teamId: string, code: string) => void;
  onSelect?: () => void;
  onToggleMenu: (teamId: string) => void;
  onCloseMenu: () => void;
  onDelete: (team: WebTeamRow) => void;
  onEdit: (team: WebTeamRow) => void;
  onLeave: (team: WebTeamRow) => void;
};

function isWorkspaceOwner(role: string): boolean {
  return role === "owner";
}

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  if (role === "admin") return "Admin";
  return "Member";
}

function roleBadgeClass(role: string): string {
  if (role === "owner") return "enterprise-team-role-badge enterprise-team-role-badge-owner";
  if (role === "team_leader") return "enterprise-team-role-badge enterprise-team-role-badge-leader";
  if (role === "admin") return "enterprise-team-role-badge enterprise-team-role-badge-admin";
  return "enterprise-team-role-badge";
}

function IconCheckSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function WorkspaceIcon({ team, compact }: { team: WebTeamRow; compact?: boolean }) {
  return (
    <div className={`enterprise-profile-ws-icon${compact ? " enterprise-profile-ws-icon-sm" : ""}`} aria-hidden>
      {team.image ? (
        <img src={team.image} alt="" className="enterprise-profile-ws-icon-img" />
      ) : (
        <span className="enterprise-profile-ws-icon-initials">{team.name?.[0]?.toUpperCase() ?? "W"}</span>
      )}
    </div>
  );
}

function WorkspaceMenu({
  team,
  workspaceMenuId,
  leaveId,
  onToggleMenu,
  onCloseMenu,
  onDelete,
  onEdit,
  onLeave,
}: Pick<Props, "team" | "workspaceMenuId" | "leaveId" | "onToggleMenu" | "onCloseMenu" | "onDelete" | "onEdit" | "onLeave">) {
  return (
    <div className="enterprise-profile-workspace-menu-wrap">
      <button
        type="button"
        className="enterprise-profile-workspace-more"
        aria-label={`Actions for ${team.name}`}
        aria-expanded={workspaceMenuId === team.id}
        data-testid={`workspace-menu-${team.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMenu(team.id);
        }}
      >
        ⋯
      </button>
      {workspaceMenuId === team.id ? (
        <div className="enterprise-profile-workspace-menu" role="menu">
          {isWorkspaceOwner(team.role) ? (
            <>
              <button
                type="button"
                role="menuitem"
                data-testid={`edit-workspace-${team.id}`}
                onClick={() => {
                  onCloseMenu();
                  onEdit(team);
                }}
              >
                Edit workspace
              </button>
              <button
                type="button"
                role="menuitem"
                className="enterprise-profile-workspace-menu-danger"
                data-testid={`delete-workspace-${team.id}`}
                onClick={() => {
                  onCloseMenu();
                  onDelete(team);
                }}
              >
                Delete workspace
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled={leaveId === team.id}
              onClick={() => {
                if (!window.confirm(`Leave “${team.name}”? You will lose access until invited again.`)) return;
                onCloseMenu();
                onLeave(team);
              }}
            >
              {leaveId === team.id ? "Leaving…" : "Leave workspace"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceProfileCard({
  team,
  isCurrent,
  variant = "list",
  copiedTeamId,
  workspaceMenuId,
  leaveId,
  onCopyInvite,
  onSelect,
  onToggleMenu,
  onCloseMenu,
  onDelete,
  onEdit,
  onLeave,
}: Props) {
  const members = team._count?.members ?? 0;
  const memberLine = `${members} member${members === 1 ? "" : "s"}`;
  const menuProps = { team, workspaceMenuId, leaveId, onToggleMenu, onCloseMenu, onDelete, onEdit, onLeave };

  if (variant === "compact") {
    return (
      <article
        className="enterprise-profile-ws-current-row"
        data-testid={`profile-workspace-card-${team.id}`}
        aria-current="true"
      >
        <WorkspaceIcon team={team} compact />
        <div className="enterprise-profile-ws-current-copy">
          <div className="enterprise-profile-ws-current-title-row">
            <h3 className="enterprise-profile-ws-current-name" title={team.name}>
              {team.name}
            </h3>
            <span className="enterprise-profile-ws-current-badge">Current</span>
          </div>
          <p className="enterprise-muted enterprise-profile-ws-current-meta">
            {memberLine} · {roleLabel(team.role)}
          </p>
        </div>
        <span className="enterprise-profile-ws-current-active">
          <IconCheckSmall />
          Active
        </span>
        <WorkspaceMenu {...menuProps} />
      </article>
    );
  }

  return (
    <article className="enterprise-profile-ws-row" data-testid={`profile-workspace-card-${team.id}`}>
      <WorkspaceIcon team={team} compact />
      <div className="enterprise-profile-ws-row-main">
        <h3 className="enterprise-profile-ws-row-name" title={team.name}>
          {team.name}
        </h3>
        <p className="enterprise-muted enterprise-profile-ws-row-meta">
          {memberLine}
          {team.inviteCode ? (
            <>
              {" · "}
              <span className="enterprise-profile-ws-row-invite">
                {team.inviteCode}
                <button
                  type="button"
                  className="enterprise-profile-ws-row-copy"
                  onClick={() => onCopyInvite(team.id, team.inviteCode!)}
                >
                  {copiedTeamId === team.id ? "Copied" : "Copy"}
                </button>
              </span>
            </>
          ) : null}
        </p>
      </div>
      <div className="enterprise-profile-ws-row-actions">
        <span className={roleBadgeClass(team.role)}>{roleLabel(team.role)}</span>
        <button
          type="button"
          className="enterprise-profile-ws-row-switch"
          onClick={onSelect}
          data-testid={`profile-workspace-switch-${team.id}`}
        >
          Switch
        </button>
        <WorkspaceMenu {...menuProps} />
      </div>
    </article>
  );
}
