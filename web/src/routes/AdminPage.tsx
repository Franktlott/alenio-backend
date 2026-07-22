import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AlenioNoticeModal } from "../components/AlenioNoticeModal";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { UserAvatar } from "../components/UserAvatar";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  deleteAdminUser,
  fetchAdminTeams,
  fetchAdminUser,
  fetchAdminUsers,
  formatAdminDate,
  planLabel,
  setAdminUserPlatformAdmin,
  type AdminUserDetail,
  type AdminUserRow,
} from "../lib/admin-api";
import { SenecaStudioPage } from "./settings/SenecaStudioPage";
import { AdminEnterpriseCustomersPanel } from "./AdminEnterpriseCustomersPanel";

type AdminSection = "users" | "workspaces" | "enterprise-customers" | "seneca-studio";

function parseAdminSection(raw: string | null): AdminSection {
  if (raw === "workspaces" || raw === "seneca-studio" || raw === "enterprise-customers") return raw;
  return "users";
}

export function AdminPage() {
  const { me } = useEnterpriseShell();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [section, setSection] = useState<AdminSection>(() => parseAdminSection(searchParams.get("tab")));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; tone: "success" | "error" | "info" } | null>(
    null,
  );

  useEffect(() => {
    const next = parseAdminSection(searchParams.get("tab"));
    setSection((prev) => (prev === next ? prev : next));
    if (next !== "users") setSelectedUserId(null);
  }, [searchParams]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  const usersQuery = useQuery({
    queryKey: ["admin", "users", debouncedSearch],
    queryFn: () => fetchAdminUsers(debouncedSearch || undefined),
    enabled: me?.isAdmin === true && section === "users",
  });

  const teamsQuery = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => fetchAdminTeams(),
    enabled: me?.isAdmin === true && section === "workspaces",
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "users", selectedUserId],
    queryFn: () => fetchAdminUser(selectedUserId!),
    enabled: me?.isAdmin === true && !!selectedUserId,
  });

  if (me === undefined) {
    return <EnterprisePageLoading label="Loading administration" />;
  }

  if (me === null || me.isAdmin !== true) {
    return <Navigate to="/dashboard" replace />;
  }

  const currentUserId = me.id;
  const users = usersQuery.data ?? [];
  const teams = teamsQuery.data ?? [];
  const detail = detailQuery.data ?? null;

  async function refreshUsers() {
    await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  async function handleToggleAdmin(user: AdminUserDetail | AdminUserRow) {
    const makingAdmin = !user.isAdmin;
    const isSelf = user.id === currentUserId;
    if (!makingAdmin && isSelf) {
      setNotice({
        title: "Cannot remove admin",
        message: "You cannot remove platform admin access from your own account.",
        tone: "info",
      });
      return;
    }
    const ok = window.confirm(
      makingAdmin
        ? `Grant ${user.name} full platform admin access?`
        : `Remove platform admin access from ${user.name}?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await setAdminUserPlatformAdmin(user.id, makingAdmin);
      await refreshUsers();
      if (selectedUserId === user.id) {
        await queryClient.invalidateQueries({ queryKey: ["admin", "users", user.id] });
      }
      setNotice({
        title: makingAdmin ? "Platform admin granted" : "Platform admin removed",
        message: makingAdmin
          ? `${user.name} can now open the Admin tab.`
          : `${user.name} no longer has platform admin access.`,
        tone: "success",
      });
    } catch (e) {
      setNotice({
        title: "Could not update admin",
        message: e instanceof Error ? e.message : "Something went wrong.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(user: AdminUserDetail | AdminUserRow) {
    if (user.id === currentUserId) {
      setNotice({
        title: "Cannot delete yourself",
        message: "You cannot delete your own admin account.",
        tone: "info",
      });
      return;
    }
    if (user.isAdmin) {
      setNotice({
        title: "Cannot delete admin",
        message: "Remove platform admin access before deleting this user.",
        tone: "info",
      });
      return;
    }
    const ok = window.confirm(
      `Permanently delete ${user.name}? All their data will be removed and this cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteAdminUser(user.id);
      setSelectedUserId(null);
      await refreshUsers();
      setNotice({
        title: "User deleted",
        message: `${user.name} has been removed.`,
        tone: "success",
      });
    } catch (e) {
      setNotice({
        title: "Could not delete user",
        message: e instanceof Error ? e.message : "Something went wrong.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const sectionCopy =
    section === "seneca-studio"
      ? {
          title: "Seneca Studio",
          subtitle: "Platform-wide coaching tone, rules, knowledge, and templates for every workspace.",
        }
      : section === "enterprise-customers"
        ? {
            title: "Enterprise customers",
            subtitle: "Company accounts that can own multiple workspaces, SSO, and SCIM.",
          }
      : section === "workspaces"
        ? {
            title: "Workspaces",
            subtitle: "All workspaces on the platform.",
          }
        : {
            title: "Users",
            subtitle: "Platform users and admin access.",
          };

  return (
    <div
      className={`enterprise-tab-shell enterprise-tab-shell-scroll enterprise-admin-page${
        section === "seneca-studio" ? " enterprise-admin-page--studio" : ""
      }`}
      data-testid="admin-screen"
    >
      {section === "seneca-studio" ? (
        <SenecaStudioPage scope="platform" embedded />
      ) : section === "enterprise-customers" ? (
        <AdminEnterpriseCustomersPanel />
      ) : (
        <>
          <div className="enterprise-admin-header">
            <div>
              <h1 className="enterprise-admin-title">{sectionCopy.title}</h1>
              <p className="enterprise-muted">{sectionCopy.subtitle}</p>
            </div>
          </div>

          {section === "users" ? (
        <div className={`enterprise-admin-layout${selectedUserId ? " enterprise-admin-layout--detail" : ""}`}>
          <div className="enterprise-admin-list">
            <label className="enterprise-admin-search">
              <span className="sr-only">Search users</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                data-testid="admin-user-search"
              />
            </label>
            {usersQuery.isLoading ? (
              <p className="enterprise-muted">Loading users…</p>
            ) : usersQuery.isError ? (
              <p className="enterprise-muted">
                {usersQuery.error instanceof Error ? usersQuery.error.message : "Could not load users."}
              </p>
            ) : (
              <div className="enterprise-table-wrap">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Admin</th>
                      <th>Teams</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="enterprise-table-empty">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr
                          key={user.id}
                          className={`enterprise-table-row-clickable${
                            selectedUserId === user.id ? " enterprise-admin-row--selected" : ""
                          }`}
                          onClick={() => setSelectedUserId(user.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedUserId(user.id);
                            }
                          }}
                          tabIndex={0}
                          data-testid={`admin-user-row-${user.id}`}
                        >
                          <td>
                            <span className="enterprise-admin-user-cell">
                              <UserAvatar
                                user={user}
                                className="enterprise-admin-av"
                                imgClassName="enterprise-admin-av-img"
                              />
                              <span>{user.name}</span>
                            </span>
                          </td>
                          <td>{user.email}</td>
                          <td>
                            {user.isAdmin ? <span className="enterprise-admin-badge">Admin</span> : "—"}
                          </td>
                          <td>{user._count.teamMembers}</td>
                          <td>{formatAdminDate(user.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedUserId ? (
            <aside className="enterprise-admin-detail" aria-label="User detail">
              <div className="enterprise-admin-detail-head">
                <button
                  type="button"
                  className="enterprise-team-btn-outline"
                  onClick={() => setSelectedUserId(null)}
                >
                  Close
                </button>
              </div>
              {detailQuery.isLoading ? (
                <p className="enterprise-muted">Loading…</p>
              ) : detailQuery.isError || !detail ? (
                <p className="enterprise-muted">
                  {detailQuery.error instanceof Error ? detailQuery.error.message : "User not found."}
                </p>
              ) : (
                <>
                  <div className="enterprise-admin-detail-profile">
                    <UserAvatar
                      user={detail}
                      className="enterprise-admin-av enterprise-admin-av--lg"
                      imgClassName="enterprise-admin-av-img"
                    />
                    <div>
                      <h2>{detail.name}</h2>
                      <p className="enterprise-muted">{detail.email}</p>
                      {detail.isAdmin ? <span className="enterprise-admin-badge">Platform admin</span> : null}
                    </div>
                  </div>
                  <dl className="enterprise-admin-meta">
                    <div>
                      <dt>Created</dt>
                      <dd>{formatAdminDate(detail.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Email verified</dt>
                      <dd>{detail.emailVerified ? "Yes" : "No"}</dd>
                    </div>
                    <div>
                      <dt>Teams</dt>
                      <dd>{detail._count.teamMembers}</dd>
                    </div>
                    <div>
                      <dt>Tasks created</dt>
                      <dd>{detail._count.tasksCreated}</dd>
                    </div>
                  </dl>
                  {detail.teamMembers.length > 0 ? (
                    <div className="enterprise-admin-teams">
                      <h3>Workspaces</h3>
                      <ul>
                        {detail.teamMembers.map((m) => (
                          <li key={`${m.team.id}-${m.role}`}>
                            <span>{m.team.name}</span>
                            <span className="enterprise-muted">{m.role}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="enterprise-admin-actions">
                    <button
                      type="button"
                      className="enterprise-team-btn-outline"
                      disabled={busy || (detail.isAdmin && detail.id === currentUserId)}
                      onClick={() => void handleToggleAdmin(detail)}
                    >
                      {detail.isAdmin ? "Remove platform admin" : "Grant platform admin"}
                    </button>
                    {!detail.isAdmin ? (
                      <button
                        type="button"
                        className="enterprise-team-btn-destructive"
                        disabled={busy || detail.id === currentUserId}
                        onClick={() => void handleDelete(detail)}
                      >
                        Delete user
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </aside>
          ) : null}
        </div>
      ) : teamsQuery.isLoading ? (
        <p className="enterprise-muted">Loading workspaces…</p>
      ) : teamsQuery.isError ? (
        <p className="enterprise-muted">
          {teamsQuery.error instanceof Error ? teamsQuery.error.message : "Could not load workspaces."}
        </p>
      ) : (
        <div className="enterprise-table-wrap">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Members</th>
                <th>Owner</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 ? (
                <tr>
                  <td colSpan={6} className="enterprise-table-empty">
                    No workspaces found
                  </td>
                </tr>
              ) : (
                teams.map((team) => (
                  <tr key={team.id}>
                    <td>{team.name}</td>
                    <td>{planLabel(team.subscription.plan)}</td>
                    <td>{team.subscription.status}</td>
                    <td>{team.memberCount}</td>
                    <td>
                      {team.owner ? (
                        <span className="enterprise-admin-owner">
                          <span>{team.owner.name}</span>
                          <span className="enterprise-muted">{team.owner.email}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatAdminDate(team.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      <AlenioNoticeModal
        open={!!notice}
        title={notice?.title ?? ""}
        message={notice?.message ?? ""}
        tone={notice?.tone ?? "info"}
        onClose={() => setNotice(null)}
      />
    </div>
  );
}
