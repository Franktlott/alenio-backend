import { useEffect, useRef, useState } from "react";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { ProfileTeamsSection } from "../components/ProfileTeamsSection";
import {
  patchApiProfile,
  uploadProfilePhoto,
  type WebMeUser,
  type WebTeamRow,
} from "../lib/api";

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
  const {
    me,
    setMe,
    teams,
    setTeams,
    selectedTeamId,
    setWorkspaceMainLoading,
    refreshMeAndTeams,
  } = useEnterpriseShell();
  const [nameEdit, setNameEdit] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const prevWorkspaceRef = useRef("");

  useEffect(() => {
    if (me) setNameEdit((prev) => (prev === "" || !isEditing ? me.name?.trim() ?? "" : prev));
  }, [me?.id, me?.name, isEditing]);

  useEffect(() => {
    if (!selectedTeamId) {
      prevWorkspaceRef.current = selectedTeamId;
      return;
    }
    const prev = prevWorkspaceRef.current;
    if (prev === "") {
      prevWorkspaceRef.current = selectedTeamId;
      return;
    }
    if (prev === selectedTeamId) return;
    prevWorkspaceRef.current = selectedTeamId;
    let cancelled = false;
    setWorkspaceMainLoading(true);
    void (async () => {
      try {
        await refreshMeAndTeams();
      } finally {
        if (!cancelled) setWorkspaceMainLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, refreshMeAndTeams, setWorkspaceMainLoading]);

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
      <div className="enterprise-dashboard-inner enterprise-profile-page">
        <p className="enterprise-muted">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <div className="enterprise-dashboard-inner enterprise-profile-page">
        <h1 className="enterprise-page-title enterprise-profile-page-title">Profile</h1>

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

        <ProfileTeamsSection teams={teams ?? []} onRefresh={refreshMeAndTeams} />
      </div>
    </>
  );
}
