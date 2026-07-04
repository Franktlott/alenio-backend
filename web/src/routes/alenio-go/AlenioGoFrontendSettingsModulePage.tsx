import { Navigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { fetchWebTeam, patchWebTeamGoFrontendSettings, uploadChatMedia } from "../../lib/api";
import {
  DEFAULT_GO_FRONTEND_SETTINGS,
  isUsingWorkspaceHeroImage,
  resolveGoHeroImage,
  type GoFrontendSettings,
} from "../../lib/go-frontend-settings";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoFrontendSettingsModulePage() {
  const { teamId, teamName, teamImage, canManage } = useAlenioGoShell();
  const [settings, setSettings] = useState<GoFrontendSettings>(DEFAULT_GO_FRONTEND_SETTINGS);
  const [workspaceImage, setWorkspaceImage] = useState<string | null>(teamImage ?? null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTeam = useCallback(() => {
    if (!teamId) return Promise.resolve();
    return fetchWebTeam(teamId)
      .then((team) => {
        setWorkspaceImage(team.image ?? null);
        setSettings(team.goFrontendSettings ?? DEFAULT_GO_FRONTEND_SETTINGS);
      })
      .catch(() => undefined);
  }, [teamId]);

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    void fetchWebTeam(teamId)
      .then((team) => {
        setWorkspaceImage(team.image ?? null);
        setSettings(team.goFrontendSettings ?? DEFAULT_GO_FRONTEND_SETTINGS);
      })
      .catch(() => setError("Could not load Alenio Go settings."))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const previewImage = useMemo(
    () => resolveGoHeroImage(workspaceImage, settings),
    [workspaceImage, settings],
  );
  const usingWorkspacePhoto = isUsingWorkspaceHeroImage(settings);

  if (!canManage) return <Navigate to="/go" replace />;
  if (!teamId) return null;

  async function onSave(nextSettings: GoFrontendSettings) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const savedSettings = await patchWebTeamGoFrontendSettings(teamId!, nextSettings);
      setSettings(savedSettings);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
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
      try {
        const uploaded = await uploadChatMedia(file);
        const next = { heroImageUrl: uploaded.url };
        setSettings(next);
        await onSave(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Photo upload failed.");
      } finally {
        setPhotoBusy(false);
      }
    };
    input.click();
  }

  async function onUseWorkspacePhoto() {
    const next = { heroImageUrl: null };
    setSettings(next);
    await onSave(next);
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
            Settings saved.
          </p>
        ) : null}

        {!loading ? (
          <>
            <div className="go-frontend-settings-preview-wrap">
              <div
                className="go-frontend-settings-preview"
                style={
                  previewImage
                    ? {
                        backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.76), rgba(67,97,238,0.52)), url(${previewImage})`,
                      }
                    : undefined
                }
              >
                <div className="go-frontend-settings-preview-copy">
                  <strong>{teamName || "Workspace"}</strong>
                  <span>Dashboard header preview</span>
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
                disabled={busy || usingWorkspacePhoto}
                onClick={() => void onUseWorkspacePhoto()}
                data-testid="go-frontend-use-workspace-photo"
              >
                Use workspace photo
              </button>
            </div>

            <p className="go-frontend-settings-foot enterprise-muted">
              Workspace photo changes are managed in Team settings. This page only controls the Alenio Go tablet
              experience.
            </p>
          </>
        ) : null}
      </div>
    </GoBackendModuleShell>
  );
}
