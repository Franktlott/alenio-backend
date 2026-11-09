import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { clearAccessToken, getAuthClient, syncBackendUser } from "../lib/auth-client";
import { patchApiProfile, uploadProfilePhoto, type WebTeamRow } from "../lib/api";
import { setPersistedEnterpriseTeamId } from "../lib/enterprise-selected-team";
import { senecaStudioAccess } from "../lib/seneca-studio-api";
import { COMMON_TIMEZONES, formatTimeZoneLabel, getBrowserTimeZone, resolveTimeZone } from "../lib/timezone";
import { formatOutlookUserError } from "../lib/outlook-calendar-errors";
import { LEGAL_COMPANY_NAME } from "../lib/legal-constants";
import { UserAvatar } from "./UserAvatar";
import { OutlookCalendarPanel } from "./OutlookCalendarPanel";
import { OutlookCalendarAlert } from "./OutlookCalendarAlert";
import { ChangeEmailModal } from "./ChangeEmailModal";
import { DeleteAccountModal } from "./DeleteAccountModal";
import "./account-panel.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

function roleLabel(teams: WebTeamRow[]): string {
  if (teams.some((t) => t.role === "owner")) return "Owner";
  if (teams.some((t) => t.role === "team_leader")) return "Team leader";
  if (teams.some((t) => t.role === "admin")) return "Admin";
  return "Member";
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * Your account, in a panel that slides in from the right. Personal things only:
 * photo, name, email, time zone, calendar, sign out. Workspace management lives on /settings.
 */
export function AccountPanel({ open, onClose }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { me, setMe, teams, selectedTeamId, refreshMeAndTeams } = useEnterpriseShell();

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(getBrowserTimeZone());
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [outlookNotice, setOutlookNotice] = useState<string | null>(null);
  const [outlookError, setOutlookError] = useState<string | null>(null);

  const activeTeam = teams?.find((t) => t.id === selectedTeamId) ?? teams?.[0];
  const aiAccess = senecaStudioAccess(activeTeam?.role);
  const workspaceCount = teams?.length ?? 0;

  useEffect(() => {
    setTimezone(resolveTimeZone(me?.timezone));
  }, [me?.timezone]);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setError(null);
    }
  }, [open]);

  /** Outlook sends the browser back with ?outlook=connected|error. */
  useEffect(() => {
    const outlook = searchParams.get("outlook");
    if (!outlook) return;
    const message = searchParams.get("message");
    const next = new URLSearchParams(searchParams);
    next.delete("outlook");
    next.delete("message");
    setSearchParams(next, { replace: true });
    if (outlook === "connected") {
      setOutlookNotice("Your Outlook events will appear on your Alenio calendar.");
      setOutlookError(null);
    } else if (outlook === "error") {
      setOutlookNotice(null);
      setOutlookError(formatOutlookUserError(message));
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !changeEmailOpen && !deleteOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, changeEmailOpen, deleteOpen]);

  const startEdit = () => {
    setError(null);
    setNameDraft(me?.name?.trim() ?? "");
    setEditing(true);
  };

  const saveName = async () => {
    if (!me || !nameDraft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchApiProfile({ name: nameDraft.trim() });
      setMe((prev) => (prev ? { ...prev, name: updated.name } : prev));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your name.");
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !me) return;
      setPhotoBusy(true);
      setError(null);
      try {
        const up = await uploadProfilePhoto(file);
        const updated = await patchApiProfile({ image: up.url });
        setMe((prev) => (prev ? { ...prev, image: updated.image ?? prev.image } : prev));
        void queryClient.invalidateQueries({ queryKey: ["team", "context"] });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Photo upload failed.");
      } finally {
        setPhotoBusy(false);
      }
    };
    input.click();
  };

  const saveTimezone = async (value: string) => {
    setTimezone(value);
    setTimezoneSaving(true);
    setError(null);
    try {
      const updated = await patchApiProfile({ timezone: value });
      setMe((prev) => (prev ? { ...prev, timezone: updated.timezone } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save time zone.");
    } finally {
      setTimezoneSaving(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await getAuthClient().signOut();
    } catch {
      /* local sign-out still proceeds */
    }
    clearAccessToken();
    setPersistedEnterpriseTeamId("");
    onClose();
    navigate("/login", { replace: true });
  };

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  if (!open) return null;

  return (
    <>
      <div className="account-backdrop" onClick={onClose} aria-hidden />
      <aside className="account-panel" role="dialog" aria-modal="true" aria-labelledby="account-panel-title" data-testid="account-panel">
        <header className="account-head">
          <h2 id="account-panel-title">Account</h2>
          <button type="button" className="account-close" onClick={onClose} aria-label="Close account panel">
            ×
          </button>
        </header>

        <div className="account-body">
          <section className="account-identity">
            <button
              type="button"
              className="account-avatar"
              onClick={pickPhoto}
              disabled={photoBusy || !me}
              aria-label="Change profile photo"
              title="Change photo"
            >
              <UserAvatar
                user={me ?? { name: null, email: null, image: null }}
                className="account-avatar-wrap"
                imgClassName="account-avatar-img"
                alt=""
              />
              <span className="account-avatar-badge">{photoBusy ? "…" : "Edit"}</span>
            </button>

            {editing ? (
              <form
                className="account-name-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveName();
                }}
              >
                <label htmlFor="account-name" className="account-label">
                  Display name
                </label>
                <input
                  id="account-name"
                  className="account-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  autoComplete="name"
                  autoFocus
                />
                <div className="account-name-actions">
                  <button type="button" className="account-btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="account-btn-primary" disabled={saving || !nameDraft.trim()}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="account-identity-copy">
                <div className="account-name-row">
                  <strong className="account-name">{me?.name?.trim() || "Add your name"}</strong>
                  <button type="button" className="account-inline-link" onClick={startEdit} disabled={!me}>
                    Edit
                  </button>
                </div>
                <div className="account-email-row">
                  <span className="account-email">{me?.email ?? "—"}</span>
                  {me?.email ? (
                    <button type="button" className="account-inline-link" onClick={() => setChangeEmailOpen(true)}>
                      Change
                    </button>
                  ) : null}
                </div>
                <span className="account-role">{roleLabel(teams ?? [])}</span>
              </div>
            )}
          </section>

          {error ? (
            <p className="account-error" role="alert">
              {error}
            </p>
          ) : null}

          <section className="account-section">
            <h3>Preferences</h3>
            <div className="account-field">
              <label htmlFor="account-timezone">Time zone</label>
              <select
                id="account-timezone"
                className="account-input account-select"
                value={timezone}
                disabled={!me || timezoneSaving}
                onChange={(e) => void saveTimezone(e.target.value)}
              >
                {!COMMON_TIMEZONES.includes(timezone as (typeof COMMON_TIMEZONES)[number]) ? (
                  <option value={timezone}>{formatTimeZoneLabel(timezone)}</option>
                ) : null}
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTimeZoneLabel(tz)}
                  </option>
                ))}
              </select>
              <p className="account-hint">Used for due dates, recurring tasks, and calendar days.</p>
            </div>
          </section>

          <section className="account-section">
            <h3>Calendar</h3>
            {outlookNotice ? <OutlookCalendarAlert variant="success" message={outlookNotice} /> : null}
            {outlookError ? <OutlookCalendarAlert variant="error" message={outlookError} /> : null}
            <div className="account-outlook">
              <OutlookCalendarPanel
                onStatusChange={() => {
                  setOutlookNotice(null);
                  setOutlookError(null);
                }}
              />
            </div>
          </section>

          <section className="account-section">
            <h3>Workspaces</h3>
            <div className="account-rows">
              <button type="button" className="account-row" onClick={() => go("/settings")} data-testid="account-manage-workspaces">
                <span className="account-row-copy">
                  <strong>Manage workspaces</strong>
                  <span>
                    {workspaceCount === 0
                      ? "Create or join a workspace"
                      : `${workspaceCount} ${workspaceCount === 1 ? "workspace" : "workspaces"}${activeTeam ? ` · ${activeTeam.name}` : ""}`}
                  </span>
                </span>
                <Chevron />
              </button>
              {aiAccess.canView ? (
                <button type="button" className="account-row" onClick={() => go("/settings/ai")}>
                  <span className="account-row-copy">
                    <strong>Seneca AI settings</strong>
                    <span>Priorities and context for {activeTeam?.name ?? "this workspace"}</span>
                  </span>
                  <Chevron />
                </button>
              ) : null}
              {activeTeam?.role === "owner" ? (
                <button type="button" className="account-row" onClick={() => go("/settings/sso/okta")}>
                  <span className="account-row-copy">
                    <strong>Okta SSO &amp; SCIM</strong>
                    <span>Company sign-in and user provisioning</span>
                  </span>
                  <Chevron />
                </button>
              ) : null}
            </div>
          </section>
        </div>

        <footer className="account-foot">
          <button type="button" className="account-signout" onClick={() => void signOut()} disabled={signingOut} data-testid="account-sign-out">
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <nav className="account-legal" aria-label="Legal">
            <Link to="/privacy" onClick={onClose}>
              Privacy
            </Link>
            <span aria-hidden>·</span>
            <Link to="/terms" onClick={onClose}>
              Terms
            </Link>
            <span aria-hidden>·</span>
            <button type="button" onClick={() => setDeleteOpen(true)} data-testid="account-deletion-link">
              Delete account
            </button>
          </nav>
          <p className="account-entity">{LEGAL_COMPANY_NAME}</p>
        </footer>
      </aside>

      <ChangeEmailModal
        open={changeEmailOpen}
        currentEmail={me?.email ?? ""}
        onClose={() => setChangeEmailOpen(false)}
        onChanged={async (email) => {
          setMe((prev) => (prev ? { ...prev, email } : prev));
          await syncBackendUser();
          try {
            await getAuthClient().getSession({ fetchOptions: { headers: { "X-Force-Fetch": "1" } } } as never);
          } catch {
            /* best effort */
          }
          await refreshMeAndTeams();
        }}
      />
      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={async () => {
          try {
            await getAuthClient().signOut();
          } catch {
            /* ignore */
          }
          clearAccessToken();
          setPersistedEnterpriseTeamId("");
          onClose();
          navigate("/login", { replace: true });
        }}
      />
    </>
  );
}
