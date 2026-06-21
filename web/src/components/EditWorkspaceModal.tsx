import { useEffect, useState } from "react";
import { patchApiTeam, uploadTeamPhoto, type WebTeamRow } from "../lib/api";

type Props = {
  team: WebTeamRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function EditWorkspaceModal({ team, onClose, onSaved }: Props) {
  const [nameEdit, setNameEdit] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!team) return;
    setNameEdit(team.name);
    setImageUrl(team.image ?? null);
    setErr(null);
  }, [team]);

  if (!team) return null;

  const busy = saving || photoBusy;

  const onPickPhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setPhotoBusy(true);
      setErr(null);
      try {
        const up = await uploadTeamPhoto(file, team.id);
        setImageUrl(up.url);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Photo upload failed.");
      } finally {
        setPhotoBusy(false);
      }
    };
    input.click();
  };

  const onSave = async () => {
    const trimmed = nameEdit.trim();
    if (!trimmed || busy) return;
    setSaving(true);
    setErr(null);
    try {
      await patchApiTeam(team.id, {
        name: trimmed,
        image: imageUrl,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update workspace.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="enterprise-modal-backdrop"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        className="enterprise-modal-panel enterprise-edit-ws-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-workspace-title"
        data-testid="edit-workspace-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="edit-workspace-title" className="enterprise-modal-title">
          Edit workspace
        </h3>
        <p className="enterprise-muted enterprise-modal-sub">
          Changes apply to everyone in this workspace.
        </p>

        <div className="enterprise-edit-ws-body">
          <div className="enterprise-edit-ws-photo-col">
            <div className="enterprise-edit-ws-photo" aria-hidden>
              {imageUrl ? (
                <img src={imageUrl} alt="" className="enterprise-edit-ws-photo-img" />
              ) : (
                <span className="enterprise-edit-ws-photo-initials">{nameEdit?.[0]?.toUpperCase() ?? "W"}</span>
              )}
            </div>
            <button type="button" className="enterprise-team-pill-btn" disabled={busy} onClick={onPickPhoto}>
              {photoBusy ? "Uploading…" : "Change photo"}
            </button>
          </div>

          <div className="enterprise-edit-ws-fields">
            <label className="enterprise-muted enterprise-profile-label" htmlFor="edit-workspace-name">
              Workspace name
            </label>
            <input
              id="edit-workspace-name"
              className="auth-input enterprise-modal-input enterprise-edit-ws-name-input"
              value={nameEdit}
              onChange={(e) => {
                setNameEdit(e.target.value);
                setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nameEdit.trim() && !busy) {
                  e.preventDefault();
                  void onSave();
                }
              }}
              autoComplete="organization"
              data-testid="edit-workspace-name-input"
            />
          </div>
        </div>

        {err ? (
          <p className="enterprise-form-error" role="alert">
            {err}
          </p>
        ) : null}

        <div className="enterprise-modal-actions">
          <button type="button" className="enterprise-inline-link" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="enterprise-modal-primary-btn"
            disabled={busy || !nameEdit.trim()}
            data-testid="confirm-edit-workspace"
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
