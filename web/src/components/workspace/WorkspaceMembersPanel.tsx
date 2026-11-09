import { Crown, Sprout, UserPlus, UserRound, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WebTeamMemberRow } from "../../lib/api";
import { AlenioList, AlenioListRow, Button, EmptyState, FilterBar, Panel, PanelHeader, RowActions, RowMetadata, SearchField } from "../ui";
import { UserAvatar } from "../UserAvatar";
import { workspaceRoleLabel } from "./WorkspaceSubNav";

export const MEMBER_ROLE_RANK: Record<string, number> = { owner: 0, team_leader: 1, admin: 2 };

export function sortMembers(members: WebTeamMemberRow[]): WebTeamMemberRow[] {
  return [...members].sort(
    (a, b) =>
      (MEMBER_ROLE_RANK[a.role] ?? 3) - (MEMBER_ROLE_RANK[b.role] ?? 3) ||
      (a.user.name ?? a.user.email ?? "").localeCompare(b.user.name ?? b.user.email ?? ""),
  );
}

function joinedLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Joined ${d.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
}

/** Everyone in the workspace, searchable, leaders first. */
export function WorkspaceMembersPanel({
  members,
  loading,
  meId,
  onOpenMember,
  onInvite,
}: {
  members: WebTeamMemberRow[];
  loading: boolean;
  meId: string;
  onOpenMember: (userId: string) => void;
  onInvite?: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => sortMembers(members), [members]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((m) => `${m.user.name ?? ""} ${m.user.email ?? ""}`.toLowerCase().includes(q));
  }, [sorted, query]);

  return (
    <Panel className="al-ds ws-members-panel" aria-labelledby="ws-members-title" data-testid="ws-members-page">
      <PanelHeader
        titleId="ws-members-title"
        title={
          <>
            Members <span className="al-seg-count ws-members-total">{members.length}</span>
          </>
        }
        subtitle="The people in this workspace. Open someone to see their profile and growth."
        actions={
          onInvite ? (
            <Button variant="primary" icon={<UserPlus size={16} strokeWidth={2.2} />} onClick={onInvite} data-testid="ws-members-page-invite">
              Invite people
            </Button>
          ) : undefined
        }
      />
      <FilterBar>
        <SearchField value={query} onChange={setQuery} placeholder="Search members" />
      </FilterBar>

      <AlenioList
        label="Workspace members"
        loading={loading && members.length === 0}
        loadingRows={6}
        empty={
          shown.length === 0 ? (
            <EmptyState
              icon={<Users size={20} strokeWidth={2} />}
              title={query ? "No one matches that search" : "No members yet"}
              description={query ? "Try a different name or email." : undefined}
            />
          ) : undefined
        }
      >
        {shown.map((m) => {
          const name = m.user.name ?? m.user.email ?? "Member";
          const lead = m.role === "owner" || m.role === "team_leader";
          const joined = joinedLabel(m.joinedAt);
          const showEmail = Boolean(m.user.name && m.user.email);
          return (
            <AlenioListRow
              key={m.id}
              testId={`ws-member-card-${m.userId}`}
              onOpen={() => onOpenMember(m.userId)}
              openLabel={`Open ${name}`}
              leading={<UserAvatar user={m.user} className="al-row-avatar" imgClassName="nw-avatar-img" alt="" />}
              title={name}
              titleAddon={m.userId === meId ? <span className="al-tag">You</span> : null}
              meta={
                <RowMetadata>
                  <span className={lead ? "ws-member-role ws-member-role--lead" : "ws-member-role"}>
                    {lead ? <Crown size={12} strokeWidth={2.2} aria-hidden /> : null}
                    {workspaceRoleLabel(m.role)}
                  </span>
                  {showEmail ? <span className="ws-member-email">{m.user.email}</span> : null}
                  {joined}
                </RowMetadata>
              }
              trailing={
                <RowActions
                  label={`Actions for ${name}`}
                  testId={`ws-member-menu-${m.userId}`}
                  actions={[
                    { id: "open", label: "Open member", icon: <Sprout size={15} strokeWidth={2} />, onSelect: () => onOpenMember(m.userId) },
                    {
                      id: "profile",
                      label: "View public profile",
                      icon: <UserRound size={15} strokeWidth={2} />,
                      onSelect: () => navigate(`/people/${encodeURIComponent(m.userId)}`),
                    },
                  ]}
                />
              }
            />
          );
        })}
      </AlenioList>
    </Panel>
  );
}
