import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarPlus,
  CheckSquare,
  ChevronRight,
  Eye,
  MailWarning,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import {
  AlenioDataTable,
  Button,
  EmptyState,
  Pagination,
  RowActions,
  SearchField,
  Select,
  StatusIndicator,
  type AlenioColumn,
  type RowAction,
} from "../../components/ui";
import { UserAvatar } from "../../components/UserAvatar";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  clearIncompleteSignups,
  deleteIncompleteSignup,
  deleteIncompleteSignups,
  fetchAdminUsers,
  fetchIncompleteSignups,
  formatAdminDate,
  type AdminUserRow,
  type IncompleteSignupRow,
} from "../../lib/admin-api";
import { staffCan, staffRoleLabel } from "../../lib/staff-access";
import "../discover/discover-manage.css";
import "./admin-users.css";
import { AdminIncompleteSignupDrawer } from "./AdminIncompleteSignupDrawer";
import { AdminUserDrawer } from "./AdminUserDrawer";

type Tab = "all" | "in-workspace" | "no-workspace" | "admins" | "incomplete";
type Sort = "newest" | "name" | "workspaces";

const PAGE_SIZE = 10;
const DAY = 864e5;

const TABS: Array<[Tab, string]> = [
  ["all", "All users"],
  ["in-workspace", "In a workspace"],
  ["no-workspace", "No workspace"],
  ["admins", "Staff"],
  ["incomplete", "Incomplete signups"],
];

function matchesTab(user: AdminUserRow, tab: Tab): boolean {
  if (tab === "incomplete") return false;
  if (tab === "in-workspace") return user._count.teamMembers > 0;
  if (tab === "no-workspace") return user._count.teamMembers === 0;
  if (tab === "admins") return user.isAdmin;
  return true;
}

function incompleteStatusLabel(row: IncompleteSignupRow): string {
  if (row.status === "awaiting_verification") return "Awaiting verification";
  if (row.status === "verified_not_synced") return "Verified, not synced";
  return "Synced";
}

export function AdminUsersPage() {
  const { me } = useEnterpriseShell();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIncompleteIds, setSelectedIncompleteIds] = useState<string[]>([]);
  const [reviewSignupId, setReviewSignupId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const drawerUserId = searchParams.get("user");
  const drawerMode = searchParams.get("new") === "1" ? "new" : drawerUserId ? "view" : null;
  const openUser = (id: string, edit = false) => {
    const next = new URLSearchParams(searchParams);
    next.set("user", id);
    if (edit) next.set("edit", "1");
    else next.delete("edit");
    next.delete("new");
    setSearchParams(next, { replace: true });
  };
  const openNew = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("user");
    next.delete("edit");
    next.set("new", "1");
    setSearchParams(next, { replace: true });
  };
  const closeDrawer = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("user");
    next.delete("edit");
    next.delete("new");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const usersQuery = useQuery({
    queryKey: ["admin", "users", query],
    queryFn: () => fetchAdminUsers(query || undefined),
    enabled: staffCan(me, "users.view"),
    staleTime: 30_000,
  });
  // Unfiltered list for the stat cards and side panel, so a search doesn't change them.
  const allQuery = useQuery({
    queryKey: ["admin", "users", ""],
    queryFn: () => fetchAdminUsers(),
    enabled: staffCan(me, "users.view"),
    staleTime: 30_000,
  });
  const incompleteQuery = useQuery({
    queryKey: ["admin", "users", "incomplete", query],
    queryFn: () => fetchIncompleteSignups(query || undefined),
    enabled: staffCan(me, "users.view"),
    staleTime: 30_000,
  });

  const all = allQuery.data ?? [];
  const incompleteRows = incompleteQuery.data?.data ?? [];
  const incompleteMeta = incompleteQuery.data?.meta;
  const stats = useMemo(() => {
    const now = Date.now();
    const week = all.filter((u) => now - Date.parse(u.createdAt) < 7 * DAY).length;
    const month = all.filter((u) => now - Date.parse(u.createdAt) < 30 * DAY).length;
    const prevMonth = all.filter((u) => {
      const age = now - Date.parse(u.createdAt);
      return age >= 30 * DAY && age < 60 * DAY;
    }).length;
    return {
      total: all.length,
      week,
      month,
      prevMonth,
      inWorkspace: all.filter((u) => u._count.teamMembers > 0).length,
      admins: all.filter((u) => u.isAdmin).length,
    };
  }, [all]);

  const recent = useMemo(
    () => [...all].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5),
    [all],
  );

  const visible = useMemo(() => {
    const list = (usersQuery.data ?? []).filter((u) => matchesTab(u, tab));
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "workspaces") return b._count.teamMembers - a._count.teamMembers;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
    return list;
  }, [usersQuery.data, tab, sort]);

  const incompleteVisible = useMemo(() => {
    const list = [...incompleteRows];
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
    return list;
  }, [incompleteRows, sort]);

  const showingIncomplete = tab === "incomplete";
  const activeCount = showingIncomplete ? incompleteVisible.length : visible.length;
  const pages = Math.max(1, Math.ceil(activeCount / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const rows = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const incompletePageRows = incompleteVisible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  };

  const goToTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setSelectedIncompleteIds([]);
    setReviewSignupId(null);
    setBulkMessage(null);
  };
  const mayEdit = staffCan(me, "users.edit");
  const mayCreate = staffCan(me, "users.create");
  const mayDelete = staffCan(me, "users.delete");
  const mayManageStaff = staffCan(me, "staff.manage");
  const reviewSignup = reviewSignupId ? incompleteRows.find((row) => row.id === reviewSignupId) ?? null : null;
  const selectedIncompleteCount = selectedIncompleteIds.length;
  const deletableIncompleteIds = incompleteVisible
    .filter((row) => selectedIncompleteIds.includes(row.id) && !row.hasAppUser)
    .map((row) => row.id);

  const refreshIncomplete = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "users", "incomplete"] });
  };

  const selectAllIncompleteVisible = () => {
    setSelectedIncompleteIds(incompleteVisible.map((row) => row.id));
  };

  const clearIncompleteSelection = () => {
    setSelectedIncompleteIds([]);
  };

  const deleteSelectedIncomplete = async () => {
    if (!mayDelete || deletableIncompleteIds.length === 0) return;
    const skipped = selectedIncompleteCount - deletableIncompleteIds.length;
    const ok = window.confirm(
      `Delete ${deletableIncompleteIds.length.toLocaleString()} incomplete signup${deletableIncompleteIds.length === 1 ? "" : "s"}?` +
        (skipped > 0 ? `\n\n${skipped.toLocaleString()} selected row(s) already have an Alenio app user and will be skipped.` : "") +
        "\n\nThis cannot be undone.",
    );
    if (!ok) return;
    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const result = await deleteIncompleteSignups(deletableIncompleteIds);
      setSelectedIncompleteIds([]);
      if (reviewSignupId && result.deleted.some((row) => row.id === reviewSignupId)) {
        setReviewSignupId(null);
      }
      setBulkMessage(
        `Deleted ${result.deletedCount.toLocaleString()} signup${result.deletedCount === 1 ? "" : "s"}` +
          (result.skippedCount ? ` · skipped ${result.skippedCount.toLocaleString()}` : ""),
      );
      refreshIncomplete();
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : "Could not delete selected signups.");
    } finally {
      setBulkBusy(false);
    }
  };

  const clearAllIncomplete = async () => {
    if (!mayDelete) return;
    const count = incompleteMeta?.incompleteCount ?? incompleteVisible.filter((row) => !row.hasAppUser).length;
    const ok = window.confirm(
      `Clear all incomplete signups without an Alenio app user?\n\nAbout ${count.toLocaleString()} auth account(s) may be removed. This cannot be undone.`,
    );
    if (!ok) return;
    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const result = await clearIncompleteSignups();
      setSelectedIncompleteIds([]);
      setReviewSignupId(null);
      setBulkMessage(
        `Cleared ${result.deletedCount.toLocaleString()} incomplete signup${result.deletedCount === 1 ? "" : "s"}` +
          (result.capped ? " · more may remain — run Clear again" : ""),
      );
      refreshIncomplete();
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : "Could not clear incomplete signups.");
    } finally {
      setBulkBusy(false);
    }
  };

  if (me === undefined) return <EnterprisePageLoading label="Loading users" />;
  if (me === null || !staffCan(me, "users.view")) return <Navigate to="/settings" replace />;

  const userActions = (user: AdminUserRow): RowAction[] => {
    const actions: RowAction[] = [
      { id: "view", label: "View", icon: <Eye size={15} strokeWidth={2} />, onSelect: () => openUser(user.id) },
    ];
    if (mayEdit && (!user.isAdmin || mayManageStaff)) {
      actions.push({ id: "edit", label: "Edit", icon: <Pencil size={15} strokeWidth={2} />, onSelect: () => openUser(user.id, true) });
    }
    if (mayManageStaff) {
      actions.push({
        id: "staff",
        label: "Staff role…",
        icon: <ShieldCheck size={15} strokeWidth={2} />,
        disabled: user.id === me.id,
        hint: user.id === me.id ? "You can't change your own staff role" : undefined,
        onSelect: () => openUser(user.id),
      });
    }
    if (mayDelete) {
      actions.push({
        id: "delete",
        label: "Delete",
        icon: <Trash2 size={15} strokeWidth={2} />,
        tone: "danger",
        disabled: user.id === me.id || user.isAdmin,
        hint:
          user.id === me.id
            ? "You can't delete your own account"
            : user.isAdmin
              ? "Staff accounts can't be deleted here"
              : undefined,
        onSelect: () => {
          // The drawer owns the typed confirmation.
          const next = new URLSearchParams(searchParams);
          next.set("user", user.id);
          next.delete("edit");
          next.delete("new");
          next.set("delete", "1");
          setSearchParams(next, { replace: true });
        },
      });
    }
    return actions;
  };

  const columns: AlenioColumn<AdminUserRow>[] = [
    {
      id: "user",
      header: "User",
      primary: true,
      cell: (user) => (
        <span className="al-cell-entity">
          <UserAvatar user={user} className="al-row-avatar" imgClassName="au-avatar-img" alt="" />
          <span className="al-cell-copy">
            <span className="al-cell-title">
              <span className="al-cell-title-text">{user.name || "Unnamed"}</span>
              {user.id === me.id ? <span className="al-tag">You</span> : null}
            </span>
            <span className="al-cell-sub">{user.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: "workspaces",
      header: "Workspaces",
      width: "112px",
      cell: (user) =>
        user._count.teamMembers === 0 ? (
          <span className="al-cell-muted">None</span>
        ) : (
          <span className="al-cell-inline al-cell-num">
            <Building2 size={14} strokeWidth={2} aria-hidden />
            {user._count.teamMembers}
          </span>
        ),
    },
    {
      id: "role",
      header: "Role",
      width: "124px",
      cell: (user) =>
        user.isAdmin ? (
          <StatusIndicator tone="accent">{staffRoleLabel(user.staffRole ?? "super_admin")}</StatusIndicator>
        ) : (
          <StatusIndicator>Member</StatusIndicator>
        ),
    },
    {
      id: "joined",
      header: "Joined",
      width: "120px",
      cell: (user) => <span className="al-cell-muted">{formatAdminDate(user.createdAt)}</span>,
    },
  ];

  const incompleteActions = (row: IncompleteSignupRow): RowAction[] => {
    const actions: RowAction[] = [
      {
        id: "review",
        label: "Review",
        icon: <Eye size={15} strokeWidth={2} />,
        onSelect: () => setReviewSignupId(row.id),
      },
    ];
    if (mayDelete && !row.hasAppUser) {
      actions.push({
        id: "delete",
        label: "Delete",
        icon: <Trash2 size={15} strokeWidth={2} />,
        tone: "danger",
        onSelect: () => {
          void (async () => {
            const ok = window.confirm(
              `Delete incomplete signup for ${row.email}?\n\nThis cannot be undone.`,
            );
            if (!ok) return;
            setBulkBusy(true);
            setBulkMessage(null);
            try {
              await deleteIncompleteSignup(row.id);
              setSelectedIncompleteIds((ids) => ids.filter((id) => id !== row.id));
              if (reviewSignupId === row.id) setReviewSignupId(null);
              setBulkMessage(`Deleted ${row.email}`);
              refreshIncomplete();
            } catch (err) {
              setBulkMessage(err instanceof Error ? err.message : "Could not delete signup.");
            } finally {
              setBulkBusy(false);
            }
          })();
        },
      });
    }
    return actions;
  };

  const incompleteColumns: AlenioColumn<IncompleteSignupRow>[] = [
    {
      id: "user",
      header: "Signup",
      primary: true,
      cell: (row) => (
        <span className="al-cell-entity">
          <span className="au-avatar au-avatar--blank" aria-hidden>
            {(row.name || row.email).slice(0, 1).toUpperCase()}
          </span>
          <span className="al-cell-copy">
            <span className="al-cell-title">
              <span className="al-cell-title-text">{row.name || "Unnamed"}</span>
            </span>
            <span className="al-cell-sub">{row.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: "180px",
      cell: (row) => (
        <StatusIndicator tone={row.emailVerified ? "accent" : "warning"}>
          {incompleteStatusLabel(row)}
        </StatusIndicator>
      ),
    },
    {
      id: "app",
      header: "App user",
      width: "120px",
      cell: (row) =>
        row.hasAppUser ? (
          <span className="al-cell-muted">Yes</span>
        ) : (
          <span className="al-cell-muted">No</span>
        ),
    },
    {
      id: "started",
      header: "Started",
      width: "120px",
      cell: (row) => <span className="al-cell-muted">{formatAdminDate(row.createdAt)}</span>,
    },
  ];

  const loading = showingIncomplete ? incompleteQuery.isLoading : usersQuery.isLoading;
  const error = showingIncomplete
    ? incompleteQuery.error instanceof Error
      ? incompleteQuery.error.message
      : incompleteQuery.isError
        ? "Could not load incomplete signups."
        : null
    : usersQuery.error instanceof Error
      ? usersQuery.error.message
      : usersQuery.isError
        ? "Could not load users."
        : null;

  return (
    <div className="dm-page au-page" data-testid="admin-users">
      <header className="dm-hero">
        <img src="/alenio-home-hero-morning.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy">
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <span>Admin</span>
            <span aria-hidden>›</span>
            <span>Users</span>
          </nav>
          <h1>User Management</h1>
          <p>
            {showingIncomplete
              ? "Better Auth accounts that started signup and may have received email, but never finished becoming Alenio users."
              : "Everyone with an Alenio account, across every workspace."}
          </p>
        </div>
      </header>

      <nav className="dm-tabs" aria-label="User lists">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`dm-tab${tab === id ? " dm-tab--active" : ""}`}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => goToTab(id)}
            data-testid={`au-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? <p className="discover-error">{error}</p> : null}

      <div className="dm-grid">
        <div className="dm-main">
          <section className="dm-stats" aria-label="User summary">
            <button
              type="button"
              className={`dm-stat dm-stat--action${tab === "all" ? " dm-stat--active" : ""}`}
              onClick={() => goToTab("all")}
              aria-pressed={tab === "all"}
            >
              <span className="dm-stat-icon">
                <Users size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>{allQuery.data ? stats.total.toLocaleString() : "—"}</strong>
                <span>Total users</span>
              </div>
            </button>
            <div className="dm-stat">
              <span className="dm-stat-icon">
                <CalendarPlus size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>{allQuery.data ? stats.week.toLocaleString() : "—"}</strong>
                <span>New this week</span>
              </div>
            </div>
            <button
              type="button"
              className={`dm-stat dm-stat--action${tab === "in-workspace" ? " dm-stat--active" : ""}`}
              onClick={() => goToTab("in-workspace")}
              aria-pressed={tab === "in-workspace"}
            >
              <span className="dm-stat-icon">
                <Building2 size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>{allQuery.data ? stats.inWorkspace.toLocaleString() : "—"}</strong>
                <span>In a workspace</span>
              </div>
            </button>
            <button
              type="button"
              className={`dm-stat dm-stat--action${tab === "admins" ? " dm-stat--active" : ""}`}
              onClick={() => goToTab("admins")}
              aria-pressed={tab === "admins"}
            >
              <span className="dm-stat-icon">
                <ShieldCheck size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>{allQuery.data ? stats.admins.toLocaleString() : "—"}</strong>
                <span>Staff</span>
              </div>
            </button>
            <button
              type="button"
              className={`dm-stat dm-stat--action${tab === "incomplete" ? " dm-stat--active" : ""}`}
              onClick={() => goToTab("incomplete")}
              aria-pressed={tab === "incomplete"}
              data-testid="au-stat-incomplete"
            >
              <span className="dm-stat-icon">
                <MailWarning size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>
                  {incompleteMeta ? incompleteMeta.incompleteCount.toLocaleString() : incompleteQuery.isLoading ? "—" : "0"}
                </strong>
                <span>Incomplete signups</span>
              </div>
            </button>
          </section>

          <section className="dm-card dm-articles al-ds" aria-label={showingIncomplete ? "Incomplete signups" : "Users"}>
            <header className="al-table-head">
              <h2 className="al-panel-title">
                {showingIncomplete ? "Incomplete signups" : "Users"}{" "}
                <span className="al-seg-count">{activeCount.toLocaleString()}</span>
              </h2>
              <div className="al-toolbar">
                <SearchField
                  value={q}
                  onChange={(value) => {
                    setPage(1);
                    setQ(value);
                  }}
                  placeholder="Search name or email"
                  label={showingIncomplete ? "Search incomplete signups" : "Search users"}
                  data-testid="au-search"
                />
                <Select
                  value={sort === "workspaces" && showingIncomplete ? "newest" : sort}
                  aria-label={showingIncomplete ? "Sort incomplete signups" : "Sort users"}
                  onChange={(event) => {
                    setPage(1);
                    setSort(event.target.value as Sort);
                  }}
                >
                  <option value="newest">Newest first</option>
                  <option value="name">Name A–Z</option>
                  {showingIncomplete ? null : <option value="workspaces">Most workspaces</option>}
                </Select>
              </div>
            </header>

            {showingIncomplete && incompleteMeta ? (
              <p className="au-incomplete-note">
                Better Auth accounts: {incompleteMeta.authUserCount?.toLocaleString() ?? "—"} · Finished app users:{" "}
                {incompleteMeta.appUserCount?.toLocaleString() ?? "—"}
                {incompleteMeta.capped
                  ? ` · Showing ${incompleteMeta.returnedCount?.toLocaleString() ?? incompleteRows.length.toLocaleString()} of ${incompleteMeta.incompleteCount.toLocaleString()}`
                  : null}
              </p>
            ) : null}

            {showingIncomplete && mayDelete ? (
              <div className="au-bulk-bar" role="toolbar" aria-label="Incomplete signup actions">
                <div className="au-bulk-copy">
                  <strong>
                    {selectedIncompleteCount > 0
                      ? `${selectedIncompleteCount.toLocaleString()} selected`
                      : `${activeCount.toLocaleString()} incomplete`}
                  </strong>
                  {bulkMessage ? <span className="au-bulk-msg">{bulkMessage}</span> : null}
                </div>
                <div className="au-bulk-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={bulkBusy || incompleteVisible.length === 0}
                    onClick={selectAllIncompleteVisible}
                  >
                    <CheckSquare size={14} strokeWidth={2} />
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={bulkBusy || selectedIncompleteCount === 0}
                    onClick={clearIncompleteSelection}
                  >
                    Clear selection
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={bulkBusy || deletableIncompleteIds.length === 0}
                    onClick={() => void deleteSelectedIncomplete()}
                    data-testid="au-incomplete-delete-selected"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                    {bulkBusy ? "Working…" : "Delete selected"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={bulkBusy || activeCount === 0}
                    onClick={() => void clearAllIncomplete()}
                    data-testid="au-incomplete-clear-all"
                  >
                    Clear all
                  </Button>
                </div>
              </div>
            ) : null}

            {showingIncomplete ? (
              <AlenioDataTable
                flush
                label="Incomplete signups"
                rows={incompletePageRows}
                columns={incompleteColumns}
                getRowId={(row) => row.id}
                getRowLabel={(row) => `Review ${row.email}`}
                getRowTestId={(row) => `au-incomplete-row-${row.id}`}
                selectable={mayDelete}
                selectedIds={selectedIncompleteIds}
                onSelectionChange={setSelectedIncompleteIds}
                onRowClick={(row) => setReviewSignupId(row.id)}
                rowActions={(row) => (
                  <RowActions
                    actions={incompleteActions(row)}
                    label={`Actions for ${row.email}`}
                    testId={`au-incomplete-menu-${row.id}`}
                  />
                )}
                loading={loading}
                busy={(loading || bulkBusy) && incompletePageRows.length > 0}
                loadingRows={6}
                emptyState={
                  <EmptyState
                    icon={<MailWarning size={20} strokeWidth={2} />}
                    title={query ? "No incomplete signups match" : "No incomplete signups"}
                    description={
                      query
                        ? "Try a different search."
                        : "When someone starts signup and never finishes verification, they will show up here."
                    }
                  />
                }
              />
            ) : (
              <AlenioDataTable
                flush
                label="Users"
                rows={rows}
                columns={columns}
                getRowId={(user) => user.id}
                getRowLabel={(user) => `Open ${user.name || user.email}`}
                getRowTestId={(user) => `au-row-${user.id}`}
                onRowClick={(user) => openUser(user.id)}
                rowActions={(user) => (
                  <RowActions actions={userActions(user)} label={`Actions for ${user.name}`} testId={`au-menu-${user.id}`} />
                )}
                loading={loading}
                busy={loading && rows.length > 0}
                loadingRows={6}
                emptyState={
                  <EmptyState
                    icon={<Users size={20} strokeWidth={2} />}
                    title={query || tab !== "all" ? "No one matches" : "No users yet"}
                    description={query || tab !== "all" ? "Try a different search or list." : "New accounts will show up here."}
                  />
                }
              />
            )}
            <Pagination
              page={safePage - 1}
              pageSize={PAGE_SIZE}
              total={activeCount}
              onPageChange={(next) => setPage(next + 1)}
              itemLabel={showingIncomplete ? "signups" : "users"}
            />
          </section>
        </div>

        <aside className="dm-side">
          {mayCreate ? (
            <button type="button" className="dm-new" onClick={openNew} data-testid="au-new-user">
              <Plus size={18} strokeWidth={2.4} />
              New user
            </button>
          ) : null}

          <section className="dm-card dm-panel" aria-label="Recent signups">
            <div className="dm-panel-head">
              <UserPlus size={15} strokeWidth={2.2} />
              <h3>Recent signups</h3>
            </div>
            {recent.length === 0 ? (
              <p className="dm-panel-empty">New accounts appear here as people join.</p>
            ) : (
              <ul className="au-recent">
                {recent.map((user) => (
                  <li key={user.id}>
                    <button type="button" onClick={() => openUser(user.id)}>
                      <UserAvatar user={user} className="au-avatar au-avatar--sm" imgClassName="au-avatar-img" alt="" />
                      <span className="dm-ranked-copy">
                        <span className="dm-ranked-title">{user.name || user.email}</span>
                        <span className="dm-ranked-sub">{formatAdminDate(user.createdAt)}</span>
                      </span>
                      <ChevronRight size={15} strokeWidth={2.2} className="au-recent-chevron" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dm-card dm-panel" aria-label="Growth">
            <div className="dm-panel-head">
              <CalendarPlus size={15} strokeWidth={2.2} />
              <h3>Growth</h3>
            </div>
            <dl className="au-growth">
              <div>
                <dt>Last 30 days</dt>
                <dd>{allQuery.data ? stats.month.toLocaleString() : "—"}</dd>
              </div>
              <div>
                <dt>Previous 30 days</dt>
                <dd>{allQuery.data ? stats.prevMonth.toLocaleString() : "—"}</dd>
              </div>
              <div>
                <dt>Without a workspace</dt>
                <dd>{allQuery.data ? (stats.total - stats.inWorkspace).toLocaleString() : "—"}</dd>
              </div>
            </dl>
            <Link to="/admin/workspaces" className="dm-panel-link au-growth-link">
              See workspaces
            </Link>
          </section>
        </aside>
      </div>

      <AdminUserDrawer
        mode={drawerMode}
        userId={drawerUserId}
        startEditing={searchParams.get("edit") === "1"}
        startDeleting={searchParams.get("delete") === "1"}
        currentUserId={me.id}
        onClose={closeDrawer}
        onChanged={() => void refresh()}
        onDeleted={() => {
          closeDrawer();
          void refresh();
        }}
        onCreated={(id) => openUser(id)}
      />

      <AdminIncompleteSignupDrawer
        signup={reviewSignup}
        onClose={() => setReviewSignupId(null)}
        onDeleted={(id) => {
          setReviewSignupId(null);
          setSelectedIncompleteIds((ids) => ids.filter((value) => value !== id));
          setBulkMessage("Deleted signup");
          refreshIncomplete();
        }}
      />
    </div>
  );
}
