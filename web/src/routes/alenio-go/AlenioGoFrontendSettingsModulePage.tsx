import { Navigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { fetchWebTeam, patchWebTeamGoFrontendSettings, uploadChatMedia } from "../../lib/api";
import {
  DEFAULT_GO_FRONTEND_SETTINGS,
  goFrontendSettingsEqual,
  isUsingWorkspaceHeroImage,
  resolveGoHeroImage,
  type GoFrontendSettings,
} from "../../lib/go-frontend-settings";
import { probeImageUrl } from "../../lib/image-probe";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoFrontendSettingsModulePage() {
  const { teamId, teamName, teamImage, canManage } = useAlenioGoShell();
  const [savedSettings, setSavedSettings] = useState<GoFrontendSettings>(DEFAULT_GO_FRONTEND_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<GoFrontendSettings>(DEFAULT_GO_FRONTEND_SETTINGS);
  const [workspaceImage, setWorkspaceImage] = useState<string | null>(teamImage ?? null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);

  const effectiveWorkspaceImage = workspaceImage ?? teamImage ?? null;

  const applyTeamSettings = useCallback((team: Awaited<ReturnType<typeof fetchWebTeam>>) => {
    const next = team.goFrontendSettings ?? DEFAULT_GO_FRONTEND_SETTINGS;
    setWorkspaceImage(team.image ?? null);
    setSavedSettings(next);
    setDraftSettings(next);
  }, []);

  const refreshTeam = useCallback(() => {
    if (!teamId) return Promise.resolve();
    return fetchWebTeam(teamId).then(applyTeamSettings).catch(() => undefined);
  }, [applyTeamSettings, teamId]);

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    void fetchWebTeam(teamId)
      .then(applyTeamSettings)
      .catch(() => setError("Could not load Alenio Go settings."))
      .finally(() => setLoading(false));
  }, [applyTeamSettings, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const previewImage = useMemo(
    () => resolveGoHeroImage(effectiveWorkspaceImage, draftSettings),
    [draftSettings, effectiveWorkspaceImage],
  );
  const usingWorkspacePhoto = isUsingWorkspaceHeroImage(draftSettings);
  const hasUnsavedChanges = !goFrontendSettingsEqual(draftSettings, savedSettings);

  useEffect(() => {
    setPreviewImageFailed(false);
  }, [previewImage]);

  if (!canManage) return <Navigate to="/go" replace />;
  if (!teamId) return null;

  async function persistSettings(nextSettings: GoFrontendSettings) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const persisted = await patchWebTeamGoFrontendSettings(teamId!, nextSettings);
      setSavedSettings(persisted);
      setDraftSettings(persisted);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3200);
      await refreshTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  function onPickHeaderPhoto() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setPhotoBusy(true);
      setError(null);
      setSaved(false);
      try {
        const uploaded = await uploadChatMedia(file);
        setDraftSettings({ heroImageUrl: uploaded.url });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Photo upload failed.");
      } finally {
        setPhotoBusy(false);
      }
    };
    input.click();
  }

  async function onUseWorkspacePhoto() {
    const workspaceUrl = effectiveWorkspaceImage?.trim();
    if (!workspaceUrl || !(await probeImageUrl(workspaceUrl))) {
      setError(
        "Workspace photo is missing or unavailable. Open Team settings, upload your workspace photo, save, then try again.",
      );
      return;
    }
    setError(null);
    setSaved(false);
    setDraftSettings({ heroImageUrl: null });
  }

  async function onSaveToTablets() {
    if (!hasUnsavedChanges || saving) return;
    if (!usingWorkspacePhoto) {
      const headerUrl = draftSettings.heroImageUrl?.trim();
      if (!headerUrl || !(await probeImageUrl(headerUrl))) {
        setError("Uploaded header image is unavailable. Please upload again.");
        return;
      }
    }
    await persistSettings(draftSettings);
  }

  const busy = saving || photoBusy;

  return (
    <GoBackendModuleShell
      title="Frontend settings"
      subtitle="Customize what associates see on linked Alenio Go tablets — starting with the dashboard header image."
      tone="cyan"
    >
      <div className="go-backend-module-panel go-backend-panel-card go-frontend-settings-panel">
        {loading ? <p className="enterprise-muted">Loading settings…</p> : null}
        {error ? (
          <p className="enterprise-alenio-go-alert-error" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="go-frontend-settings-saved" role="status">
            Saved — linked tablets will update within a few seconds.
          </p>
        ) : null}

        {!loading ? (
          <>
            <div className="go-frontend-settings-preview-wrap">
              <div
                className={`go-frontend-settings-preview${previewImage && !previewImageFailed ? " go-frontend-settings-preview--has-image" : ""}`}
              >
                {previewImage && !previewImageFailed ? (
                  <img
                    src={previewImage}
                    alt=""
                    className="go-frontend-settings-preview-img"
                    onError={() => setPreviewImageFailed(true)}
                  />
                ) : null}
                <div className="go-frontend-settings-preview-overlay" aria-hidden />
                <div className="go-frontend-settings-preview-copy">
                  <strong>{teamName || "Workspace"}</strong>
                  <span>
                    {hasUnsavedChanges
                      ? "Preview — not live on tablets yet"
                      : usingWorkspacePhoto && (!previewImage || previewImageFailed)
                        ? "No workspace photo — add one in Team settings"
                        : "Dashboard header preview"}
                  </span>
                </div>
              </div>
            </div>

            <div className="go-frontend-settings-copy">
              <h2 className="go-backend-panel-title">Header image</h2>
              <p className="go-backend-panel-sub">
                {usingWorkspacePhoto
                  ? "Floor tablets use your workspace photo by default."
                  : "Floor tablets use your custom Alenio Go header image."}
              </p>
            </div>

            <div className="go-frontend-settings-actions">
              <button
                type="button"
                className="enterprise-alenio-go-link-btn"
                disabled={busy}
                onClick={onPickHeaderPhoto}
                data-testid="go-frontend-upload-header"
              >
                {photoBusy ? "Uploading…" : "Upload custom header"}
              </button>
              <button
                type="button"
                className="go-frontend-settings-secondary-btn"
                disabled={busy || (usingWorkspacePhoto && !hasUnsavedChanges)}
                onClick={() => void onUseWorkspacePhoto()}
                data-testid="go-frontend-use-workspace-photo"
              >
                Use workspace photo
              </button>
            </div>

            {hasUnsavedChanges ? (
              <div className="go-frontend-settings-save-row">
                <button
                  type="button"
                  className="go-frontend-settings-save-btn"
                  disabled={busy}
                  onClick={() => void onSaveToTablets()}
                  data-testid="go-frontend-save-header"
                >
                  {saving ? "Saving…" : "Save to tablets"}
                </button>
              </div>
            ) : null}

            <p className="go-frontend-settings-foot enterprise-muted">
              Upload a header to preview it here, then save to push it to linked tablets. Workspace photo changes are
              managed in Team settings.
            </p>
          </>
        ) : null}
      </div>
    </GoBackendModuleShell>
  );
}
