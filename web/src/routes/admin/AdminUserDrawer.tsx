import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Circle,
  ListTodo,
  Mail,
  Pencil,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { UserAvatar } from "../../components/UserAvatar";
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUser,
  formatAdminDate,
  isPlatformAdminEligibleEmail,
  PLATFORM_ADMIN_EMAIL_DOMAIN,
  setAdminUserStaffRole,
  updateAdminUser,
} from "../../lib/admin-api";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { STAFF_ROLE_OPTIONS, staffCan, staffRoleLabel, type StaffRole } from "../../lib/staff-access";
import "../discover/discover-categories-drawer.css";

type Mode = "view" | "new" | null;

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function roleLabel(role: string): string {
  const r = role.toLowerCase();
  if (r === "owner") return "Owner";
  if (r === "admin") return "Admin";
  if (r === "manager") return "Manager";
  return "Member";
}

/**
 * Slide-in panel for one user (profile, workspaces, edit, delete) or the
 * "new user" form. Mirrors the categories drawer so the admin area feels uniform.
 */
export function AdminUserDrawer({
  mode,
  userId,
  startEditing,
  startDeleting,
  currentUserId,
  onClose,
  onChanged,
  onDeleted,
  onCreated,
}: {
  mode: Mode;
  userId: string | null;
  startEditing: boolean;
  startDeleting: boolean;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: (id: string) => void;
  onCreated: (id: string) => void;
}) {
  const open = mode !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="dcat-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside
        className="dcat-drawer au-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "new" ? "New user" : "User details"}
        data-testid="au-drawer"
      >
        {mode === "new" ? (
          <NewUserForm onClose={onClose} onCreated={onCreated} />
        ) : userId ? (
          <UserDetail
            key={userId}
            userId={userId}
            startEditing={startEditing}
            startDeleting={startDeleting}
            isSelf={userId === currentUserId}
            onClose={onClose}
            onChanged={onChanged}
            onDeleted={onDeleted}
          />
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}

function UserDetail({
  userId,
  startEditing,
  startDeleting,
  isSelf,
  onClose,
  onChanged,
  onDeleted,
}: {
  userId: string;
  startEditing: boolean;
  startDeleting: boolean;
  isSelf: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { me } = useEnterpriseShell();
  const detail = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => fetchAdminUser(userId),
  });
  const user = detail.data;

  const [editing, setEditing] = useState(startEditing);
  const [deleting, setDeleting] = useState(startDeleting);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setEmail(user.email ?? "");
  }, [user]);

  const mayDelete = staffCan(me, "users.delete");
  const mayManageStaff = staffCan(me, "staff.manage");
  // Editing a staff login's email would hand it over, so staff accounts need a Super Admin.
  const mayEdit = staffCan(me, "users.edit") && (!user?.isAdmin || mayManageStaff);
  // A changed email can reset the password, so only company staff may change it.
  const mayEditEmail = isPlatformAdminEligibleEmail(me?.email);
  const canDelete = Boolean(user) && !isSelf && !user?.isAdmin && mayDelete;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const body: { name?: string; email?: string } = {};
    if (name.trim() && name.trim() !== user.name) body.name = name.trim();
    if (mayEditEmail && email.trim() && email.trim() !== user.email) body.email = email.trim();
    if (!body.name && !body.email) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAdminUser(user.id, body);
      await queryClient.invalidateQueries({ queryKey: ["admin", "user", user.id] });
      onChanged();
      setEditing(false);
    } catch (reason) {
      setError(errorMessage(reason, "Could not save changes."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!user || !canDelete) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminUser(user.id);
      onDeleted(user.id);
    } catch (reason) {
      setError(errorMessage(reason, "Could not delete this user."));
      setBusy(false);
    }
  };

  const changeRole = async (next: StaffRole | null) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await setAdminUserStaffRole(user.id, next);
      await queryClient.invalidateQueries({ queryKey: ["admin", "user", user.id] });
      onChanged();
    } catch (reason) {
      setError(errorMessage(reason, "Could not change the staff role."));
    } finally {
      setBusy(false);
    }
  };

  const confirmName = (user?.name || user?.email || "").trim();
  const superAdminEligible = isPlatformAdminEligibleEmail(user?.email);
  const currentRole: StaffRole | null = user?.isAdmin ? (user.staffRole ?? "super_admin") : null;
  const roleHint = isSelf
    ? "You can't change your own staff role."
    : !mayManageStaff
      ? "Only a Super Admin can change staff roles."
      : currentRole
        ? STAFF_ROLE_OPTIONS.find((option) => option.role === currentRole)?.description ?? ""
        : "A regular Alenio account. Pick a role to give staff access.";

  return (
    <>
      <header className="dcat-head au-drawer-head">
        {user ? (
          <UserAvatar user={user} className="au-avatar au-avatar--lg" imgClassName="au-avatar-img" alt="" />
        ) : (
          <span className="au-avatar au-avatar--lg au-avatar--blank" aria-hidden />
        )}
        <div className="dcat-head-copy">
          <h2>{user ? user.name || "Unnamed" : "Loading…"}</h2>
          <p className="au-drawer-email">
            {user ? (
              <>
                <Mail size={12} strokeWidth={2.2} />
                {user.email}
              </>
            ) : (
              " "
            )}
          </p>
          {user ? (
            <div className="au-drawer-badges">
              {user.isAdmin ? (
                <span className="dm-pill dm-pill--scheduled">
                  <ShieldCheck size={11} strokeWidth={2.4} /> {staffRoleLabel(currentRole)}
                </span>
              ) : (
                <span className="dm-pill dm-pill--draft">Member</span>
              )}
              {isSelf ? <span className="au-you">You</span> : null}
            </div>
          ) : null}
        </div>
        <button type="button" className="dcat-close" aria-label="Close" onClick={onClose}>
          <X size={18} strokeWidth={2.2} />
        </button>
      </header>

      {error ? <p className="dcat-error">{error}</p> : null}
      {detail.isError ? <p className="dcat-error">{errorMessage(detail.error, "Could not load this user.")}</p> : null}

      <div className="dcat-body au-drawer-body">
        {user ? (
          <>
            {editing && mayEdit ? (
              <form className="dcat-form au-edit" onSubmit={save} data-testid="au-edit-form">
                <label className="dcat-field">
                  <span>Name</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
                </label>
                <label className="dcat-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    readOnly={!mayEditEmail}
                    title={mayEditEmail ? undefined : `Only @${PLATFORM_ADMIN_EMAIL_DOMAIN} staff can change emails`}
                    required
                  />
                  {mayEditEmail ? null : (
                    <small className="dcat-note">Only @{PLATFORM_ADMIN_EMAIL_DOMAIN} staff can change a user's email.</small>
                  )}
                </label>
                <div className="dcat-form-actions">
                  <button
                    type="button"
                    className="dcat-btn"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setName(user.name ?? "");
                      setEmail(user.email ?? "");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="dcat-btn dcat-btn--primary" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            ) : null}

            <dl className="au-facts">
              <div>
                <dt>Joined</dt>
                <dd>{formatAdminDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt>Email verified</dt>
                <dd className={user.emailVerified ? "au-ok" : "au-dim"}>
                  {user.emailVerified ? (
                    <>
                      <CheckCircle2 size={14} strokeWidth={2.2} /> Verified
                    </>
                  ) : (
                    <>
                      <Circle size={14} strokeWidth={2.2} /> Not yet
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Tasks created</dt>
                <dd>
                  <ListTodo size={14} strokeWidth={2.2} />
                  {user._count.tasksCreated.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Workspaces</dt>
                <dd>
                  <Building2 size={14} strokeWidth={2.2} />
                  {user._count.teamMembers.toLocaleString()}
                </dd>
              </div>
            </dl>

            <section className="au-section" aria-label="Staff role">
              <h3>Staff role</h3>
              <div className={`au-admin-row${user.isAdmin ? " au-admin-row--on" : ""}`}>
                <span className="au-admin-icon">
                  <ShieldCheck size={16} strokeWidth={2.2} />
                </span>
                <span className="dm-ranked-copy">
                  <span className="dm-ranked-title">{currentRole ? staffRoleLabel(currentRole) : "No staff access"}</span>
                  <span className="dm-ranked-sub">{roleHint}</span>
                </span>
              </div>
              {mayManageStaff && !isSelf ? (
                <label className="dcat-field au-role-field">
                  <span>Change role</span>
                  <select
                    value={currentRole ?? ""}
                    disabled={busy}
                    onChange={(event) => void changeRole((event.target.value || null) as StaffRole | null)}
                    data-testid="au-staff-role"
                  >
                    <option value="">No staff access (regular account)</option>
                    {STAFF_ROLE_OPTIONS.map((option) => (
                      <option
                        key={option.role}
                        value={option.role}
                        disabled={option.role === "super_admin" && !superAdminEligible && currentRole !== "super_admin"}
                      >
                        {option.role === "super_admin" && !superAdminEligible
                          ? `${option.label} (@${PLATFORM_ADMIN_EMAIL_DOMAIN} only)`
                          : option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>

            <section className="au-section" aria-label="Workspaces">
              <h3>Workspaces</h3>
              {user.teamMembers.length === 0 ? (
                <p className="dcat-note au-section-empty">Not in any workspace yet.</p>
              ) : (
                <ul className="au-ws-list">
                  {user.teamMembers.map((membership) => (
                    <li key={membership.team.id}>
                      <Link to={`/admin/workspaces?team=${encodeURIComponent(membership.team.id)}`}>
                        <span className="au-ws-icon">
                          <Building2 size={15} strokeWidth={2} />
                        </span>
                        <span className="dm-ranked-copy">
                          <span className="dm-ranked-title">{membership.team.name}</span>
                          <span className="dm-ranked-sub">
                            {roleLabel(membership.role)} · joined {formatAdminDate(membership.joinedAt)}
                          </span>
                        </span>
                        <ChevronRight size={15} strokeWidth={2.2} className="au-recent-chevron" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {deleting ? (
              <section className="au-danger" aria-label="Delete user" data-testid="au-delete">
                <h3>Delete this account</h3>
                {canDelete ? (
                  <>
                    <p>
                      This removes <strong>{confirmName}</strong>, their workspace memberships and personal data. It
                      can't be undone.
                    </p>
                    <label className="dcat-field">
                      <span>Type the name to confirm</span>
                      <input
                        value={confirmText}
                        onChange={(event) => setConfirmText(event.target.value)}
                        placeholder={confirmName}
                        autoFocus
                      />
                    </label>
                    <div className="dcat-form-actions">
                      <button type="button" className="dcat-btn" disabled={busy} onClick={() => setDeleting(false)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="dcat-btn au-btn-danger"
                        disabled={busy || confirmText.trim() !== confirmName}
                        onClick={() => void remove()}
                      >
                        <Trash2 size={14} strokeWidth={2.2} />
                        {busy ? "Deleting…" : "Delete user"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p>
                    {isSelf
                      ? "You can't delete your own account from here."
                      : !mayDelete
                        ? "Your staff role can't delete accounts."
                        : "Staff accounts can't be deleted from this page."}
                  </p>
                )}
              </section>
            ) : null}
          </>
        ) : detail.isLoading ? (
          <p className="dcat-note">Loading…</p>
        ) : null}
      </div>

      {user && !editing && !deleting && (mayEdit || mayDelete) ? (
        <footer className="dcat-foot au-drawer-foot">
          {mayEdit ? (
            <button type="button" className="dcat-btn" onClick={() => setEditing(true)} data-testid="au-edit">
              <Pencil size={14} strokeWidth={2.2} />
              Edit details
            </button>
          ) : null}
          {mayDelete ? (
            <button
              type="button"
              className="dcat-btn au-btn-danger-ghost"
              disabled={!canDelete}
              title={
                isSelf ? "You can't delete your own account" : user.isAdmin ? "Staff accounts can't be deleted here" : undefined
              }
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={14} strokeWidth={2.2} />
              Delete
            </button>
          ) : null}
        </footer>
      ) : null}
    </>
  );
}

function NewUserForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createAdminUser({ name: name.trim(), email: email.trim(), password });
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onCreated(created.id);
    } catch (reason) {
      setError(errorMessage(reason, "Could not create this user."));
      setBusy(false);
    }
  };

  return (
    <>
      <header className="dcat-head">
        <span className="dcat-head-icon">
          <UserPlus size={18} strokeWidth={2.2} />
        </span>
        <div className="dcat-head-copy">
          <h2>New user</h2>
          <p>Create an account on someone's behalf. They can change the password after signing in.</p>
        </div>
        <button type="button" className="dcat-close" aria-label="Close" onClick={onClose}>
          <X size={18} strokeWidth={2.2} />
        </button>
      </header>

      {error ? <p className="dcat-error">{error}</p> : null}

      <form className="dcat-body dcat-form au-new-form" onSubmit={submit} data-testid="au-new-form">
        <label className="dcat-field">
          <span>Full name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
        </label>
        <label className="dcat-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="dcat-field">
          <span>Temporary password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="dcat-note">New accounts are regular members. They can be added to a workspace from its settings.</p>
        <div className="dcat-form-actions au-new-actions">
          <button type="button" className="dcat-btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dcat-btn dcat-btn--primary" disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </>
  );
}
