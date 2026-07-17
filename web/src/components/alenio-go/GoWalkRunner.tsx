import { useEffect, useMemo, useState } from "react";
import {
  completePublicCorrectiveAction,
  completePublicWalkRun,
  fetchPublicPublishedWalks,
  startPublicOccurrenceRun,
  startPublicWalkRun,
  submitPublicWalkItemResponse,
  uploadPublicWalkPhoto,
} from "../../lib/walks/api";
import { getTemperatureProbeAdapter } from "../../lib/walks/temperature-probe";
import type {
  WalkOccurrenceListItem,
  WalkRun,
  WalkRunSnapshotItem,
  WalkTemplate,
} from "../../lib/walks/types";
import { flattenWalkItems } from "../../lib/walks/types";
import { handleGoDeviceSessionError } from "../../lib/go-session";
import { getGoDeviceId } from "../../lib/go-device";
import { GoTestingModeBanner } from "./GoKioskModuleGate";

type Props = {
  hubToken: string;
  moduleTitle: string;
  isTesting?: boolean;
  onClose: () => void;
};

type Screen =
  | { kind: "list" }
  | { kind: "run"; run: WalkRun; index: number }
  | { kind: "done"; run: WalkRun };

function statusLabel(status: string | undefined) {
  switch (status) {
    case "PASS":
      return "Pass";
    case "FAIL":
      return "Fail";
    case "NEEDS_ACTION":
      return "Needs action";
    case "NOT_APPLICABLE":
      return "N/A";
    default:
      return "Pending";
  }
}

function temperatureHint(config: Record<string, unknown>): string {
  const unit = config.unit === "C" ? "°C" : "°F";
  const comparison = String(config.comparisonType ?? "ABOVE");
  const min = config.minimumTemperature;
  const max = config.maximumTemperature;
  if (comparison === "BELOW" && max != null) return `Must be ≤ ${max}${unit}`;
  if (comparison === "BETWEEN" && min != null && max != null) {
    return `Must be between ${min}${unit} and ${max}${unit}`;
  }
  if (min != null) return `Must be ≥ ${min}${unit}`;
  return `Enter temperature (${unit})`;
}

export function GoWalkRunner({ hubToken, moduleTitle, isTesting, onClose }: Props) {
  const deviceId = getGoDeviceId();
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [templates, setTemplates] = useState<WalkTemplate[]>([]);
  const [occurrences, setOccurrences] = useState<WalkOccurrenceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPublicPublishedWalks(hubToken, deviceId)
      .then((payload) => {
        if (!cancelled) {
          setTemplates(payload.templates);
          setOccurrences(payload.occurrences);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (handleGoDeviceSessionError(err)) return;
        setError(err instanceof Error ? err.message : "Could not load walks");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hubToken, deviceId]);

  async function handleStart(templateId: string) {
    setBusy(true);
    setError(null);
    try {
      const run = await startPublicWalkRun(hubToken, deviceId, templateId, {
        startedByName: "Floor associate",
        isTest: Boolean(isTesting),
      });
      setScreen({ kind: "run", run, index: 0 });
    } catch (err) {
      if (handleGoDeviceSessionError(err)) return;
      setError(err instanceof Error ? err.message : "Could not start walk");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartOccurrence(occurrenceId: string) {
    setBusy(true);
    setError(null);
    try {
      const run = await startPublicOccurrenceRun(hubToken, deviceId, occurrenceId, {
        startedByName: "Floor associate",
        isTest: Boolean(isTesting),
      });
      setScreen({ kind: "run", run, index: 0 });
    } catch (err) {
      if (handleGoDeviceSessionError(err)) return;
      setError(err instanceof Error ? err.message : "Could not start scheduled walk");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(itemId: string, response: unknown, photoUrls?: string[]) {
    if (screen.kind !== "run") return;
    setBusy(true);
    setError(null);
    try {
      const run = await submitPublicWalkItemResponse(
        hubToken,
        deviceId,
        screen.run.id,
        itemId,
        { response, photoUrls: photoUrls ?? null, completedBy: "Floor associate" },
      );
      const nextIndex = Math.min(screen.index + 1, Math.max(run.items.length - 1, 0));
      setScreen({ kind: "run", run, index: nextIndex });
    } catch (err) {
      if (handleGoDeviceSessionError(err)) return;
      setError(err instanceof Error ? err.message : "Could not save response");
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (screen.kind !== "run") return;
    setBusy(true);
    setError(null);
    try {
      const run = await completePublicWalkRun(hubToken, deviceId, screen.run.id);
      setScreen({ kind: "done", run });
    } catch (err) {
      if (handleGoDeviceSessionError(err)) return;
      setError(err instanceof Error ? err.message : "Could not complete walk");
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteCorrective(itemId: string, actionId: string) {
    if (screen.kind !== "run") return;
    setBusy(true);
    setError(null);
    try {
      const run = await completePublicCorrectiveAction(
        hubToken,
        deviceId,
        screen.run.id,
        itemId,
        actionId,
      );
      setScreen({ kind: "run", run, index: screen.index });
    } catch (err) {
      if (handleGoDeviceSessionError(err)) return;
      setError(err instanceof Error ? err.message : "Could not complete corrective action");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="go-walks-kiosk go-module-open-overlay" data-testid="go-walk-runner">
      {isTesting ? <GoTestingModeBanner /> : null}

      <div className="go-briefings-kiosk-nav">
        <button
          type="button"
          className="go-briefings-kiosk-back"
          onClick={() => {
            if (screen.kind === "run") {
              setScreen({ kind: "list" });
              setError(null);
              return;
            }
            onClose();
          }}
        >
          {screen.kind === "run" ? "← Walks" : "← Close"}
        </button>
      </div>

      <div className="go-briefings-kiosk-body">
        {error ? (
          <p className="enterprise-muted" role="alert" style={{ color: "#b91c1c", marginBottom: "0.75rem" }}>
            {error}
          </p>
        ) : null}

        {screen.kind === "list" ? (
          <div>
            <div className="go-briefings-kiosk-intro">
              <h1>{moduleTitle}</h1>
              <p>
                {occurrences.length > 0
                  ? "Complete scheduled walk windows first. Ad-hoc published walks are listed below."
                  : "Choose a published walk to run on this device."}
              </p>
            </div>
            {loading ? (
              <p className="enterprise-muted">Loading walks…</p>
            ) : occurrences.length === 0 && templates.length === 0 ? (
              <div className="go-kiosk-walks-empty">
                <p>No walks available right now.</p>
                <span className="enterprise-muted">Publish a walk or wait for a scheduled window.</span>
              </div>
            ) : (
              <ul className="go-kiosk-walks-list">
                {occurrences.map((occ) => (
                  <li key={occ.id}>
                    <button
                      type="button"
                      className="go-kiosk-walks-card"
                      style={{ width: "100%", textAlign: "left", cursor: busy ? "wait" : "pointer" }}
                      disabled={busy}
                      onClick={() => void handleStartOccurrence(occ.id)}
                    >
                      <strong>{occ.template?.name ?? "Scheduled walk"}</strong>
                      <span>
                        Due {new Date(occ.dueAt).toLocaleString()} · {occ.status.replace(/_/g, " ")}
                      </span>
                      <div className="go-kiosk-walks-card-meta">
                        <span>{occ.schedule?.name ?? "Scheduled window"}</span>
                      </div>
                      <span className="go-kiosk-walks-card-cta">Start window</span>
                    </button>
                  </li>
                ))}
                {templates.map((tpl) => {
                  const count = flattenWalkItems(tpl).length;
                  return (
                    <li key={tpl.id}>
                      <button
                        type="button"
                        className="go-kiosk-walks-card"
                        style={{ width: "100%", textAlign: "left", cursor: busy ? "wait" : "pointer" }}
                        disabled={busy}
                        onClick={() => void handleStart(tpl.id)}
                      >
                        <strong>{tpl.name}</strong>
                        {tpl.description ? <span>{tpl.description}</span> : null}
                        <div className="go-kiosk-walks-card-meta">
                          <span>{count} items</span>
                          {tpl.estimatedDurationMinutes != null ? (
                            <span>~{tpl.estimatedDurationMinutes} min</span>
                          ) : null}
                        </div>
                        <span className="go-kiosk-walks-card-cta">Start walk</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {screen.kind === "run" ? (
          <WalkRunActive
            run={screen.run}
            index={screen.index}
            busy={busy}
            onSelectIndex={(index) => setScreen({ kind: "run", run: screen.run, index })}
            onSubmit={(itemId, response, photoUrls) => void handleSubmit(itemId, response, photoUrls)}
            onComplete={() => void handleComplete()}
            onCompleteCorrective={(itemId, actionId) => void handleCompleteCorrective(itemId, actionId)}
            hubToken={hubToken}
            deviceId={deviceId}
            onUploadError={(message) => setError(message)}
          />
        ) : null}

        {screen.kind === "done" ? (
          <div className="go-kiosk-walks-empty" style={{ maxWidth: 420, margin: "2rem auto" }}>
            <h2 style={{ margin: "0 0 0.5rem" }}>Walk complete</h2>
            <p>
              <strong>{screen.run.template.name}</strong>
            </p>
            {screen.run.score != null ? (
              <p style={{ fontSize: "2rem", fontWeight: 800, margin: "0.75rem 0", color: "#5b21b6" }}>
                {screen.run.score}%
              </p>
            ) : (
              <p className="enterprise-muted">No score for this walk.</p>
            )}
            <button
              type="button"
              className="go-testcode-btn"
              style={{ marginTop: "1rem" }}
              onClick={() => {
                setScreen({ kind: "list" });
                setError(null);
              }}
            >
              Back to walks
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WalkRunActive({
  run,
  index,
  busy,
  onSelectIndex,
  onSubmit,
  onComplete,
  onCompleteCorrective,
  hubToken,
  deviceId,
  onUploadError,
}: {
  run: WalkRun;
  index: number;
  busy: boolean;
  onSelectIndex: (index: number) => void;
  onSubmit: (itemId: string, response: unknown, photoUrls?: string[]) => void;
  onComplete: () => void;
  onCompleteCorrective: (itemId: string, actionId: string) => void;
  hubToken: string;
  deviceId: string;
  onUploadError: (message: string) => void;
}) {
  const items = run.items;
  const item = items[index] ?? null;
  const pct = run.progress.total > 0 ? Math.round((run.progress.answered / run.progress.total) * 100) : 0;
  const canComplete = run.progress.requiredRemaining === 0 && run.status === "IN_PROGRESS";

  return (
    <div className="walk-run-page" style={{ minHeight: "70dvh" }}>
      <div className="walk-run-page-top">
        <p className="walk-run-page-kicker">Walk in progress</p>
        <h1 className="walk-run-page-title">{run.template.name}</h1>
        <div className="walk-run-page-progress">
          <div className="walk-run-page-progress-copy">
            <span>
              {run.progress.answered} of {run.progress.total} answered
            </span>
            <span>{pct}%</span>
          </div>
          <div className="walk-run-page-progress-track">
            <div className="walk-run-page-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="walk-run-page-split" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(200px, 16rem)" }}>
        <div className="walk-run-page-checklist">
          {item ? (
            <WalkItemPanel
              key={item.id}
              item={item}
              busy={busy}
              hubToken={hubToken}
              deviceId={deviceId}
              onSubmit={onSubmit}
              onCompleteCorrective={onCompleteCorrective}
              onUploadError={onUploadError}
            />
          ) : (
            <div className="walk-run-page-empty">No items on this walk.</div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="walk-run-page-actions-btn"
              disabled={busy || index <= 0}
              onClick={() => onSelectIndex(index - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="walk-run-page-actions-btn"
              disabled={busy || index >= items.length - 1}
              onClick={() => onSelectIndex(index + 1)}
            >
              Next
            </button>
            <button
              type="button"
              className="go-testcode-btn"
              disabled={busy || !canComplete}
              onClick={onComplete}
              style={{ marginLeft: "auto" }}
            >
              Complete walk
            </button>
          </div>
          {!canComplete ? (
            <p className="enterprise-muted" style={{ marginTop: "0.5rem", fontSize: "0.8125rem" }}>
              {run.progress.requiredRemaining} required item
              {run.progress.requiredRemaining === 1 ? "" : "s"} remaining
            </p>
          ) : null}
        </div>

        <aside className="walk-run-page-sidebar">
          <div className="walk-run-page-side-card">
            <h2>Steps</h2>
            <ul className="walk-run-page-rows">
              {items.map((row, i) => {
                const st = row.response?.status ?? "NOT_STARTED";
                const rowClass =
                  st === "PASS"
                    ? "walk-run-page-row--pass"
                    : st === "FAIL" || st === "NEEDS_ACTION"
                      ? "walk-run-page-row--needs_attention"
                      : "";
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`walk-run-page-row ${rowClass}`}
                      style={{
                        width: "100%",
                        border: i === index ? "1px solid #a78bfa" : undefined,
                        background: i === index ? "#faf5ff" : undefined,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onClick={() => onSelectIndex(i)}
                    >
                      <span className="walk-run-page-row-index">{i + 1}</span>
                      <span className="walk-run-page-row-label">{row.title}</span>
                      <span className="walk-run-page-row-actions">
                        <span className="walk-run-page-row-btn">{statusLabel(st)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WalkItemPanel({
  item,
  busy,
  hubToken,
  deviceId,
  onSubmit,
  onCompleteCorrective,
  onUploadError,
}: {
  item: WalkRunSnapshotItem;
  busy: boolean;
  hubToken: string;
  deviceId: string;
  onSubmit: (itemId: string, response: unknown, photoUrls?: string[]) => void;
  onCompleteCorrective: (itemId: string, actionId: string) => void;
  onUploadError: (message: string) => void;
}) {
  const config = item.config ?? {};
  const answered = item.response && item.response.status !== "NOT_STARTED";
  const corrective = item.response?.correctiveActions ?? [];

  return (
    <div className="go-kiosk-walks-form-panel">
      <p className="walk-run-page-kicker">{String(item.type).replace(/_/g, " ")}</p>
      <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.35rem", fontWeight: 800 }}>{item.title}</h2>
      {item.description ? <p className="enterprise-muted">{item.description}</p> : null}
      {item.instructions ? (
        <p style={{ marginTop: "0.5rem", color: "#334155", fontSize: "0.9rem" }}>{item.instructions}</p>
      ) : null}
      {item.required ? (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", fontWeight: 700, color: "#7c3aed" }}>Required</p>
      ) : null}
      {answered ? (
        <p style={{ marginTop: "0.75rem", fontWeight: 700, color: "#047857" }}>
          Saved — {statusLabel(item.response?.status)}
        </p>
      ) : null}

      {corrective.length > 0 ? (
        <div style={{ marginTop: "1rem", padding: "0.75rem", border: "1px solid #fecaca", borderRadius: 8 }}>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 700, color: "#b91c1c" }}>Corrective actions</p>
          {corrective.map((action) => (
            <div key={action.id} style={{ marginBottom: "0.5rem" }}>
              <strong>{action.title}</strong>
              {action.instructions ? (
                <p className="enterprise-muted" style={{ margin: "0.25rem 0" }}>
                  {action.instructions}
                </p>
              ) : null}
              {action.status === "COMPLETED" ? (
                <span style={{ color: "#047857", fontWeight: 600 }}>Done</span>
              ) : (
                <button
                  type="button"
                  className="go-testcode-btn"
                  disabled={busy}
                  onClick={() => onCompleteCorrective(item.id, action.id)}
                >
                  Mark complete
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: "1.25rem" }}>
        {item.type === "TEMPERATURE" ? (
          <TemperatureControl
            config={config}
            busy={busy}
            onSubmit={(response) => onSubmit(item.id, response)}
          />
        ) : null}
        {item.type === "YES_NO" ? (
          <YesNoControl config={config} busy={busy} onSubmit={(response) => onSubmit(item.id, response)} />
        ) : null}
        {item.type === "VISUAL_CHECK" ? (
          <VisualCheckControl
            config={config}
            busy={busy}
            hubToken={hubToken}
            deviceId={deviceId}
            onUploadError={onUploadError}
            onSubmit={(response, photoUrls) => onSubmit(item.id, response, photoUrls)}
          />
        ) : null}
        {item.type === "PHOTO" ? (
          <PhotoControl
            config={config}
            busy={busy}
            hubToken={hubToken}
            deviceId={deviceId}
            onUploadError={onUploadError}
            onSubmit={(response, photoUrls) => onSubmit(item.id, response, photoUrls)}
          />
        ) : null}
        {item.type === "MULTIPLE_CHOICE" ? (
          <MultipleChoiceControl
            config={config}
            busy={busy}
            onSubmit={(response) => onSubmit(item.id, response)}
          />
        ) : null}
        {item.type === "QUANTITY" ? (
          <QuantityControl config={config} busy={busy} onSubmit={(response) => onSubmit(item.id, response)} />
        ) : null}
        {item.type === "TEXT" ? (
          <TextControl config={config} busy={busy} onSubmit={(response) => onSubmit(item.id, response)} />
        ) : null}
        {item.type === "INSTRUCTION" ? (
          <InstructionControl
            config={config}
            busy={busy}
            onSubmit={(response) => onSubmit(item.id, response)}
          />
        ) : null}
        {!["TEMPERATURE", "YES_NO", "VISUAL_CHECK", "PHOTO", "MULTIPLE_CHOICE", "QUANTITY", "TEXT", "INSTRUCTION"].includes(
          String(item.type),
        ) ? (
          <p className="enterprise-muted">This item type is not runnable yet.</p>
        ) : null}
      </div>
    </div>
  );
}

function TemperatureControl({
  config,
  busy,
  onSubmit,
}: {
  config: Record<string, unknown>;
  busy: boolean;
  onSubmit: (response: { value: number; unit: "F" | "C"; source: "manual" }) => void;
}) {
  const unit = (config.unit === "C" ? "C" : "F") as "F" | "C";
  const [value, setValue] = useState("");
  const probe = useMemo(() => getTemperatureProbeAdapter(Boolean(config.allowBluetoothProbe)), [config.allowBluetoothProbe]);

  return (
    <div>
      <p className="enterprise-muted" style={{ marginBottom: "0.75rem" }}>
        {temperatureHint(config)}
        {probe.kind === "manual" ? " · Manual entry" : null}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="number"
          inputMode="decimal"
          className="walk-run-page-manager-input"
          style={{ maxWidth: 140, fontSize: "1.25rem", fontWeight: 700 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={unit === "C" ? "°C" : "°F"}
          disabled={busy}
        />
        <span style={{ fontWeight: 700, color: "#475569" }}>°{unit}</span>
        <button
          type="button"
          className="go-testcode-btn"
          disabled={busy || value.trim() === "" || Number.isNaN(Number(value))}
          onClick={() => onSubmit({ value: Number(value), unit, source: "manual" })}
        >
          Save reading
        </button>
      </div>
    </div>
  );
}

function YesNoControl({
  config,
  busy,
  onSubmit,
}: {
  config: Record<string, unknown>;
  busy: boolean;
  onSubmit: (response: { answer: "YES" | "NO" }) => void;
}) {
  const yesLabel = typeof config.yesLabel === "string" ? config.yesLabel : "Yes";
  const noLabel = typeof config.noLabel === "string" ? config.noLabel : "No";
  return (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
      <button type="button" className="go-testcode-btn" disabled={busy} onClick={() => onSubmit({ answer: "YES" })}>
        {yesLabel}
      </button>
      <button
        type="button"
        className="go-testcode-btn go-testcode-btn--ghost"
        disabled={busy}
        onClick={() => onSubmit({ answer: "NO" })}
      >
        {noLabel}
      </button>
    </div>
  );
}

function VisualCheckControl({
  config,
  busy,
  hubToken,
  deviceId,
  onSubmit,
  onUploadError,
}: {
  config: Record<string, unknown>;
  busy: boolean;
  hubToken: string;
  deviceId: string;
  onSubmit: (response: { selectedOption: string; photoUrls?: string[] }, photoUrls?: string[]) => void;
  onUploadError: (message: string) => void;
}) {
  const passing = Array.isArray(config.passingOptions) ? (config.passingOptions as string[]) : ["Pass"];
  const failing = Array.isArray(config.failingOptions) ? (config.failingOptions as string[]) : ["Fail"];
  const requirePhoto = Boolean(config.requirePhotoOnFailure);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadPublicWalkPhoto(hubToken, deviceId, file);
      setPhotoUrls((prev) => [...prev, uploaded.url]);
    } catch (err) {
      onUploadError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {[...passing, ...failing].map((opt) => {
          const isFail = failing.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              className={isFail ? "go-testcode-btn go-testcode-btn--ghost" : "go-testcode-btn"}
              disabled={busy || uploading || (isFail && requirePhoto && photoUrls.length === 0)}
              onClick={() =>
                onSubmit(
                  { selectedOption: opt, photoUrls: photoUrls.length ? photoUrls : undefined },
                  photoUrls,
                )
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
      {requirePhoto ? (
        <label className="walk-run-page-row-photo" style={{ width: "auto", padding: "0.5rem 0.75rem" }}>
          {uploading ? "Uploading…" : photoUrls.length ? `${photoUrls.length} photo(s)` : "Add photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy || uploading}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : null}
    </div>
  );
}

function PhotoControl({
  config,
  busy,
  hubToken,
  deviceId,
  onSubmit,
  onUploadError,
}: {
  config: Record<string, unknown>;
  busy: boolean;
  hubToken: string;
  deviceId: string;
  onSubmit: (response: { photoUrls: string[] }, photoUrls: string[]) => void;
  onUploadError: (message: string) => void;
}) {
  const min = typeof config.minimumPhotos === "number" ? config.minimumPhotos : 1;
  const max = typeof config.maximumPhotos === "number" ? config.maximumPhotos : 3;
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    if (photoUrls.length >= max) {
      onUploadError(`Maximum ${max} photos`);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadPublicWalkPhoto(hubToken, deviceId, file);
      setPhotoUrls((prev) => [...prev, uploaded.url]);
    } catch (err) {
      onUploadError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {typeof config.instructions === "string" && config.instructions ? (
        <p className="enterprise-muted" style={{ marginBottom: "0.75rem" }}>
          {config.instructions}
        </p>
      ) : (
        <p className="enterprise-muted" style={{ marginBottom: "0.75rem" }}>
          Add at least {min} photo{min === 1 ? "" : "s"} (max {max}).
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {photoUrls.map((url) => (
          <img
            key={url}
            src={url}
            alt=""
            style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <label className="walk-run-page-row-photo" style={{ width: "auto", padding: "0.5rem 0.75rem" }}>
          {uploading ? "Uploading…" : "Add photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy || uploading || photoUrls.length >= max}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className="go-testcode-btn"
          disabled={busy || uploading || photoUrls.length < min}
          onClick={() => onSubmit({ photoUrls }, photoUrls)}
        >
          Save photos
        </button>
      </div>
    </div>
  );
}

function MultipleChoiceControl({
  config,
  busy,
  onSubmit,
}: {
  config: Record<string, unknown>;
  busy: boolean;
  onSubmit: (response: { selected: string[] }) => void;
}) {
  const options = Array.isArray(config.options)
    ? config.options.filter((o): o is string => typeof o === "string")
    : [];
  const allowMultiple = Boolean(config.allowMultiple);
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(opt: string) {
    if (allowMultiple) {
      setSelected((prev) => (prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]));
      return;
    }
    setSelected([opt]);
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={selected.includes(opt) ? "go-testcode-btn" : "go-testcode-btn go-testcode-btn--ghost"}
            disabled={busy}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="go-testcode-btn"
        disabled={busy || selected.length === 0}
        onClick={() => onSubmit({ selected })}
      >
        Save selection
      </button>
    </div>
  );
}

function QuantityControl({
  config,
  busy,
  onSubmit,
}: {
  config: Record<string, unknown>;
  busy: boolean;
  onSubmit: (response: { value: number }) => void;
}) {
  const [value, setValue] = useState("");
  const unit = typeof config.unitLabel === "string" ? config.unitLabel : "";
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="number"
        inputMode="decimal"
        className="walk-run-page-manager-input"
        style={{ maxWidth: 140 }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
      />
      {unit ? <span className="enterprise-muted">{unit}</span> : null}
      <button
        type="button"
        className="go-testcode-btn"
        disabled={busy || value.trim() === "" || Number.isNaN(Number(value))}
        onClick={() => onSubmit({ value: Number(value) })}
      >
        Save quantity
      </button>
    </div>
  );
}

function TextControl({
  config,
  busy,
  onSubmit,
}: {
  config: Record<string, unknown>;
  busy: boolean;
  onSubmit: (response: { text: string }) => void;
}) {
  const [text, setText] = useState("");
  const placeholder = typeof config.placeholder === "string" ? config.placeholder : "Enter notes…";
  return (
    <div>
      <textarea
        className="walk-run-page-manager-input"
        style={{ width: "100%", minHeight: 96 }}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
      />
      <button
        type="button"
        className="go-testcode-btn"
        style={{ marginTop: "0.75rem" }}
        disabled={busy || (config.requireNonEmpty !== false && !text.trim())}
        onClick={() => onSubmit({ text })}
      >
        Save note
      </button>
    </div>
  );
}

function InstructionControl({
  config,
  busy,
  onSubmit,
}: {
  config: Record<string, unknown>;
  busy: boolean;
  onSubmit: (response: { acknowledged: boolean }) => void;
}) {
  const body = typeof config.body === "string" ? config.body : "";
  return (
    <div>
      {body ? (
        <p style={{ whiteSpace: "pre-wrap", marginBottom: "1rem", color: "#334155" }}>{body}</p>
      ) : (
        <p className="enterprise-muted" style={{ marginBottom: "1rem" }}>
          Read the instructions above, then continue.
        </p>
      )}
      <button
        type="button"
        className="go-testcode-btn"
        disabled={busy}
        onClick={() => onSubmit({ acknowledged: true })}
      >
        {config.acknowledgeRequired ? "I acknowledge" : "Continue"}
      </button>
    </div>
  );
}
