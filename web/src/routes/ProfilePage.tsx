import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LEGAL_COMPANY_NAME, LEGAL_PARENT_COMPANY_NAME } from "../lib/legal-constants";
import { clearAccessToken, getAuthClient } from "../lib/auth-client";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import { ProfileTeamsSection } from "../components/ProfileTeamsSection";
import {
  fetchWebTeams,
  patchApiProfile,
  uploadProfilePhoto,
  type WebMeUser,
  type WebTeamRow,
} from "../lib/api";
import { pickEnterpriseTeamId, setPersistedEnterpriseTeamId, switchEnterpriseWorkspace } from "../lib/enterprise-selected-team";

function userInitials(user: WebMeUser | null): string {
  if (!user) return "?";
  const n = user.name?.trim() || user.email?.trim() || "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  if (parts.length === 1 && parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return "U";
}

function userAccountBadgeLabel(teams: WebTeamRow[]): string {
  if (teams.some((t) => t.role === "owner")) return "Owner account";
  if (teams.some((t) => t.role === "team_leader")) return "Team Leader account";
  if (teams.some((t) => t.role === "admin")) return "Admin account";
  return "Member account";
}

function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const {
    me,
    setMe,
    teams,
    setTeams,
    selectedTeamId,
    setSelectedTeamId,
    refreshMeAndTeams,
  } = useEnterpriseShell();
  const [nameEdit, setNameEdit] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  const onAccountDeleted = async () => {
    try {
      await getAuthClient().signOut();
    } catch {
      /* ignore */
    }
    clearAccessToken();
    setPersistedEnterpriseTeamId("");
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    if (me) setNameEdit((prev) => (prev === "" || !isEditing ? me.name?.trim() ?? "" : prev));
  }, [me?.id, me?.name, isEditing]);

  const onSaveProfile = async () => {
    if (!me || !nameEdit.trim()) return;
    setProfileSaving(true);
    setFormErr(null);
    try {
      const updated = await patchApiProfile({ name: nameEdit.trim() });
      setMe((prev) =>
        prev
          ? {
              ...prev,
              name: updated.name,
              email: updated.email ?? prev.email,
              image: updated.image ?? prev.image,
            }
          : prev,
      );
      setIsEditing(false);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const onPickPhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !me) return;
      setPhotoBusy(true);
      setFormErr(null);
      try {
        const up = await uploadProfilePhoto(file);
        const updated = await patchApiProfile({ image: up.url });
        setMe((prev) =>
          prev
            ? {
                ...prev,
                name: updated.name ?? prev.name,
                email: updated.email ?? prev.email,
                image: updated.image ?? prev.image,
              }
            : prev,
        );
      } catch (e) {
        setFormErr(e instanceof Error ? e.message : "Photo upload failed.");
      } finally {
        setPhotoBusy(false);
      }
    };
    input.click();
  };

  if (me === undefined) {
    return (
      <div className="enterprise-tab-shell">
        <p className="enterprise-muted">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <div className="enterprise-tab-shell enterprise-profile-page" data-testid="profile-screen">
        <div className="enterprise-profile-page-body">
          <div className="enterprise-profile-grid">
          <section className="enterprise-card enterprise-profile-account">
            <div className="enterprise-profile-account-head">
            <h2 className="enterprise-card-title enterprise-card-title-spaced enterprise-profile-account-title">Account</h2>
            {!isEditing ? (
              <button
                type="button"
                className="enterprise-profile-edit-btn enterprise-profile-edit-btn-with-icon"
                disabled={!me}
                onClick={() => {
                  setFormErr(null);
                  setIsEditing(true);
                  setNameEdit(me?.name?.trim() ?? "");
                }}
              >
                <IconPencil /> Edit
              </button>
            ) : (
              <div className="enterprise-profile-account-actions">
                <button
                  type="button"
                  className="enterprise-profile-cancel-btn"
                  disabled={profileSaving}
                  onClick={() => {
                    setIsEditing(false);
                    setNameEdit(me?.name?.trim() ?? "");
                    setFormErr(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="auth-submit"
                  disabled={profileSaving || !me || !nameEdit.trim()}
                  onClick={() => void onSaveProfile()}
                >
                  {profileSaving ? "Saving…" : "Save profile"}
                </button>
              </div>
            )}
          </div>
          <div className="enterprise-profile-account-row">
            <div className="enterprise-profile-avatar-col">
              <div className="enterprise-profile-avatar-preview">
                {photoBusy ? (
                  <span className="enterprise-muted">…</span>
                ) : me?.image ? (
                  <img src={me.image} alt={`${me.name ?? me.email ?? "Your"} profile photo`} className="enterprise-profile-avatar-img" />
                ) : (
                  <span className="enterprise-profile-avatar-initials">{userInitials(me ?? null)}</span>
                )}
              </div>
              {isEditing ? (
                <button type="button" className="enterprise-team-pill-btn" disabled={photoBusy || !me} onClick={() => void onPickPhoto()}>
                  {photoBusy ? "Updating…" : "Update photo"}
                </button>
              ) : null}
            </div>
            <div className="enterprise-profile-account-fields">
              {isEditing ? (
                <>
                  <label className="enterprise-muted enterprise-profile-label" htmlFor="profile-name">
                    Display name
                  </label>
                  <input
                    id="profile-name"
                    className="auth-input enterprise-profile-name-input"
                    value={nameEdit}
                    onChange={(e) => setNameEdit(e.target.value)}
                    disabled={!me}
                    autoComplete="name"
                  />
                  <p className="enterprise-profile-edit-hint">Email cannot be changed here.</p>
                </>
              ) : (
                <>
                  <span className="enterprise-muted enterprise-profile-label">Display name</span>
                  <p className="enterprise-profile-name-display" id="profile-name-readonly">
                    {me?.name?.trim() || "—"}
                  </p>
                </>
              )}
              <div className="enterprise-muted enterprise-profile-email">{me?.email ?? "—"}</div>
              {!isEditing ? (
                <span className="enterprise-team-account-pill-badge enterprise-profile-account-type-badge">
                  {userAccountBadgeLabel(teams ?? [])}
                </span>
              ) : null}
            </div>
          </div>
          {formErr ? (
            <p className="enterprise-form-error" role="alert">
              {formErr}
            </p>
          ) : null}
          </section>

          <ProfileTeamsSection
            teams={teams ?? []}
            selectedTeamId={selectedTeamId}
            onSelectWorkspace={(teamId) => {
              if (!teamId || teamId === selectedTeamId) return;
              switchEnterpriseWorkspace(teamId, setSelectedTeamId);
            }}
            onRefresh={refreshMeAndTeams}
            onWorkspaceDeleted={async (deletedId) => {
              const fresh = await fetchWebTeams();
              setTeams(fresh ?? []);
              if (selectedTeamId === deletedId) {
                const next = pickEnterpriseTeamId(fresh ?? [], "");
                switchEnterpriseWorkspace(next, setSelectedTeamId);
              }
              await refreshMeAndTeams();
            }}
          />
          </div>

        <footer className="enterprise-profile-legal" aria-labelledby="profile-legal-heading">
          <div className="enterprise-profile-legal-inner">
            <div className="enterprise-profile-legal-copy">
              <h2 id="profile-legal-heading" className="enterprise-profile-legal-title">
                Legal information
              </h2>
              <nav className="enterprise-profile-legal-nav" aria-label="Legal documents">
                <Link to="/privacy" className="enterprise-profile-legal-link">
                  Privacy Policy
                </Link>
                <span className="enterprise-profile-legal-sep" aria-hidden>
                  |
                </span>
                <Link to="/terms" className="enterprise-profile-legal-link">
                  Terms of Service
                </Link>
                <span className="enterprise-profile-legal-sep" aria-hidden>
                  |
                </span>
                <button
                  type="button"
                  className="enterprise-profile-legal-link"
                  id="account-deletion"
                  onClick={() => setDeleteAccountOpen(true)}
                  data-testid="account-deletion-link"
                >
                  Account deletion
                </button>
              </nav>
            </div>
            <dl className="enterprise-profile-legal-entity">
              <div className="enterprise-profile-legal-entity-row">
                <dt>Operating entity</dt>
                <dd>{LEGAL_COMPANY_NAME}</dd>
              </div>
              <div className="enterprise-profile-legal-entity-row">
                <dt>Parent company</dt>
                <dd>{LEGAL_PARENT_COMPANY_NAME}</dd>
              </div>
            </dl>
          </div>
        </footer>
        </div>
      </div>

      <DeleteAccountModal
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        onDeleted={onAccountDeleted}
      />
    </>
  );
}
