import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWebTeam, patchWebTeamGoFrontendSettings, uploadGoAlertSound } from "../../lib/api";
import {
  DEFAULT_GO_FRONTEND_SETTINGS,
  goFrontendSettingsEqual,
  normalizeGoFrontendSettings,
  type GoFrontendSettings,
} from "../../lib/go-frontend-settings";
import {
  GO_ALERT_SOUND_PRESETS,
  previewGoAlertSoundUrl,
  resolveGoAlertSoundUrl,
  type GoAlertSoundSelection,
} from "../../lib/go-alert-sounds";

type Props = {
  teamId: string;
};

export function WorkplaceAlertSoundSettings({ teamId }: Props) {
  const [savedSettings, setSavedSettings] = useState<GoFrontendSettings>(DEFAULT_GO_FRONTEND_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<GoFrontendSettings>(DEFAULT_GO_FRONTEND_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyTeamSettings = useCallback((team: Awaited<ReturnType<typeof fetchWebTeam>>) => {
    const next = normalizeGoFrontendSettings(team.goFrontendSettings ?? DEFAULT_GO_FRONTEND_SETTINGS);
    setSavedSettings(next);
    setDraftSettings(next);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchWebTeam(teamId)
      .then(applyTeamSettings)
      .catch(() => setError("Could not load alert sound settings."))
      .finally(() => setLoading(false));
  }, [applyTeamSettings, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const previewUrl = useMemo(() => resolveGoAlertSoundUrl(draftSettings), [draftSettings]);
  const hasUnsavedChanges = !goFrontendSettingsEqual(draftSettings, savedSettings);
  const usingCustom = draftSettings.alertSoundPreset === "custom";

  function selectPreset(preset: GoAlertSoundSelection) {
    setSaved(false);
    setError(null);
    if (preset === "custom") {
      setDraftSettings((current) => ({
        ...current,
        alertSoundPreset: "custom",
      }));
      return;
    }
    setDraftSettings((current) => ({
      ...current,
      alertSoundPreset: preset,
      alertSoundUrl: null,
    }));
  }

  function onPickCustomSound() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.ogg,.m4a,.aac";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        setError("Alert sound must be 5 MB or smaller.");
        return;
      }
      setUploadBusy(true);
      setError(null);
      setSaved(false);
      try {
        const uploaded = await uploadGoAlertSound(teamId, file);
        const nextSettings = normalizeGoFrontendSettings({
          ...savedSettings,
          alertSoundPreset: "custom",
          alertSoundUrl: uploaded.url,
        });
        const persisted = await patchWebTeamGoFrontendSettings(teamId, nextSettings);
        const next = normalizeGoFrontendSettings(persisted);
        setSavedSettings(next);
        setDraftSettings(next);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 3200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not upload alert sound.");
      } finally {
        setUploadBusy(false);
      }
    };
    input.click();
  }

  async function onSave() {
    if (!hasUnsavedChanges || saving) return;
    if (draftSettings.alertSoundPreset === "custom" && !draftSettings.alertSoundUrl?.trim()) {
      setError("Upload a custom alert sound or choose a preset.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const persisted = await patchWebTeamGoFrontendSettings(teamId, draftSettings);
      const next = normalizeGoFrontendSettings(persisted);
      setSavedSettings(next);
      setDraftSettings(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save alert sound settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="enterprise-muted">Loading alert sound settings…</p>;
  }

  return (
    <section className="go-alert-sound-settings" aria-labelledby="go-alert-sound-settings-title">
      <header className="go-alert-sound-settings-head">
        <div>
          <p className="enterprise-alenio-go-kicker">Device audio</p>
          <h2 id="go-alert-sound-settings-title" className="go-backend-panel-title">
            Alert sound
          </h2>
          <p className="enterprise-muted enterprise-alenio-go-approvals-sub">
            Choose the sound linked tablets play for workplace alerts. You can use a built-in tone or upload your own.
          </p>
        </div>
      </header>

      <div className="go-alert-sound-settings-grid">
        {GO_ALERT_SOUND_PRESETS.map((preset) => {
          const selected = draftSettings.alertSoundPreset === preset.id;
          return (
            <div
              key={preset.id}
              className={`go-alert-sound-settings-option${selected ? " go-alert-sound-settings-option--active" : ""}`}
            >
              <button type="button" className="go-alert-sound-settings-option-main" onClick={() => selectPreset(preset.id)}>
                <span className="go-alert-sound-settings-option-label">{preset.label}</span>
                <span className="go-alert-sound-settings-option-desc">{preset.description}</span>
              </button>
              <button
                type="button"
                className="go-alert-sound-settings-preview"
                onClick={() => previewGoAlertSoundUrl(preset.path)}
              >
                Preview
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className={`go-alert-sound-settings-option go-alert-sound-settings-option--custom${
            usingCustom ? " go-alert-sound-settings-option--active" : ""
          }`}
          onClick={() => selectPreset("custom")}
        >
          <span className="go-alert-sound-settings-option-main">
            <span className="go-alert-sound-settings-option-label">Custom upload</span>
            <span className="go-alert-sound-settings-option-desc">
              Use your own MP3, WAV, OGG, or M4A file (5 MB max)
            </span>
          </span>
        </button>
      </div>

      {usingCustom ? (
        <div className="go-alert-sound-settings-custom">
          <button
            type="button"
            className="enterprise-alenio-go-link-btn go-alert-sound-settings-upload"
            disabled={uploadBusy}
            onClick={onPickCustomSound}
          >
            {uploadBusy ? "Uploading…" : draftSettings.alertSoundUrl ? "Replace custom sound" : "Upload custom sound"}
          </button>
          {draftSettings.alertSoundUrl ? (
            <div className="go-alert-sound-settings-custom-meta">
              <span className="enterprise-muted">Saved for linked tablets.</span>
              <button
                type="button"
                className="go-alert-sound-settings-preview"
                onClick={() => previewGoAlertSoundUrl(previewUrl)}
              >
                Preview
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="enterprise-alenio-go-alert-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="enterprise-alenio-go-alert-success" role="status">
          Alert sound saved for linked tablets.
        </p>
      ) : null}

      <div className="go-alert-sound-settings-actions">
        <button
          type="button"
          className="enterprise-alenio-go-link-btn"
          disabled={!hasUnsavedChanges || saving}
          onClick={() => void onSave()}
        >
          {saving ? "Saving…" : "Save alert sound"}
        </button>
        {hasUnsavedChanges ? (
          <button
            type="button"
            className="go-alert-sound-settings-reset"
            disabled={saving}
            onClick={() => {
              setDraftSettings(savedSettings);
              setError(null);
              setSaved(false);
            }}
          >
            Reset changes
          </button>
        ) : null}
      </div>
    </section>
  );
}
