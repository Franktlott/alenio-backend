import type { WebTeamMemberRow } from "../lib/api";
import { UserAvatar } from "./UserAvatar";

type Props = {
  member: WebTeamMemberRow;
  myRole: string;
  myId: string;
  manageMembers: boolean;
  rolePick: "member" | "team_leader";
  busy: boolean;
  error: string | null;
  onRolePickChange: (role: "member" | "team_leader") => void;
  onClose: () => void;
  onSaveRole: () => void;
  onTransferOwnership: () => void;
  onRemoveMember: () => void;
};

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

export function TeamMemberManageModal({
  member,
  myRole,
  myId,
  manageMembers,
  rolePick,
  busy,
  error,
  onRolePickChange,
  onClose,
  onSaveRole,
  onTransferOwnership,
  onRemoveMember,
}: Props) {
  const displayName = member.user.name ?? member.user.email ?? "Member";
  const currentRole = member.role === "team_leader" ? "team_leader" : "member";
  const canEditRole = myRole === "owner" && member.role !== "owner" && member.userId !== myId;
  const roleChanged = canEditRole && rolePick !== currentRole;
  const canRemove = manageMembers && member.role !== "owner" && member.role !== "team_leader";

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="enterprise-member-manage-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-manage-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" aria-label="Close" disabled={busy} onClick={onClose}>
          ×
        </button>

        <header className="enterprise-member-manage-head">
          <div className="enterprise-member-manage-identity">
            <UserAvatar user={member.user} className="enterprise-member-manage-avatar" alt={displayName} />
            <div className="enterprise-member-manage-copy">
              <h3 id="member-manage-title" className="enterprise-member-manage-title">
                {displayName}
              </h3>
              {member.user.email ? (
                <p className="enterprise-member-manage-email">{member.user.email}</p>
              ) : null}
              <p className="enterprise-member-manage-role-line">
                <span className={roleBadgeClass(member.role)}>{roleLabel(member.role)}</span>
              </p>
            </div>
          </div>
        </header>

        <div className="enterprise-member-manage-body">
          {canEditRole ? (
            <section className="enterprise-member-manage-section">
              <h4 className="enterprise-member-manage-section-title">Access &amp; permissions</h4>
              <p className="enterprise-member-manage-section-sub">
                Team leaders can approve join requests and manage members. Members have standard workspace access.
              </p>
              <label className="enterprise-member-manage-field-label" htmlFor="member-role-select">
                Role
              </label>
              <select
                id="member-role-select"
                className="enterprise-team-list-search enterprise-member-manage-select"
                value={rolePick}
                disabled={busy}
                onChange={(e) => onRolePickChange(e.target.value as "member" | "team_leader")}
              >
                <option value="member">Member</option>
                <option value="team_leader">Team Leader</option>
              </select>
              <div className="enterprise-member-manage-actions">
                <button
                  type="button"
                  className="enterprise-modal-primary-btn"
                  disabled={busy || !roleChanged}
                  onClick={() => void onSaveRole()}
                >
                  {busy && roleChanged ? "Saving…" : "Save role"}
                </button>
              </div>
            </section>
          ) : null}

          {canEditRole ? (
            <section className="enterprise-member-manage-section enterprise-member-manage-section--divider">
              <h4 className="enterprise-member-manage-section-title">Workspace ownership</h4>
              <p className="enterprise-member-manage-section-sub">
                Transfer full ownership of this workspace. You will become a member.
              </p>
              <button
                type="button"
                className="enterprise-member-manage-secondary-btn"
                disabled={busy}
                onClick={() => void onTransferOwnership()}
              >
                Transfer ownership
              </button>
            </section>
          ) : null}

          {canRemove ? (
            <section className="enterprise-member-manage-section enterprise-member-manage-section--danger">
              <h4 className="enterprise-member-manage-section-title">Remove member</h4>
              <p className="enterprise-member-manage-section-sub">
                Revoke access to this workspace. They can rejoin with an invite.
              </p>
              <button
                type="button"
                className="enterprise-team-btn-destructive enterprise-member-manage-danger-btn"
                disabled={busy}
                onClick={() => void onRemoveMember()}
              >
                Remove from team
              </button>
            </section>
          ) : null}

          {!canEditRole && !canRemove ? (
            <p className="enterprise-muted enterprise-member-manage-readonly">
              You don&apos;t have permission to change settings for this member.
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="enterprise-form-error enterprise-member-manage-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
