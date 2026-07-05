import { useMemo, useState } from "react";
import type { WalkItemResponse, WalkItemStatus, WalkTemplateRow } from "../../lib/api";
import { uploadChatMedia } from "../../lib/api";
import {
  allWalkItemsReviewed,
  computeWalkDraftStats,
  getWalkTemplateSections,
  walkStatusBadgeClass,
  walkStatusLabel,
} from "../../lib/walks-display";

type DraftResponse = {
  itemId: string;
  label: string;
  status?: WalkItemStatus;
  notes: string;
  photoUrl: string | null;
  photoPreview?: string | null;
};

type Props = {
  template: WalkTemplateRow;
  busy?: boolean;
  error?: string | null;
  managerName?: string;
  onManagerNameChange?: (name: string) => void;
  requireManagerName?: boolean;
  onComplete: (payload: { responses: WalkItemResponse[]; finalNotes?: string | null }) => Promise<void>;
  onCancel: () => void;
};

export function WalkRunPanel({
  template,
  busy,
  error,
  managerName = "",
  onManagerNameChange,
  requireManagerName,
  onComplete,
  onCancel,
}: Props) {
  const sections = useMemo(() => getWalkTemplateSections(template), [template]);
  const templateItems = template.items ?? [];
  const [responses, setResponses] = useState<DraftResponse[]>(() =>
    templateItems.map((item) => ({
      itemId: item.id,
      label: item.label,
      notes: "",
      photoUrl: null,
      photoPreview: null,
    })),
  );
  const [finalNotes, setFinalNotes] = useState("");
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const stats = useMemo(() => {
    const reviewed = responses
      .filter((r) => r.status)
      .map((r) => ({
        itemId: r.itemId,
        label: r.label,
        status: r.status!,
        notes: r.notes.trim() || null,
        photoUrl: r.photoUrl,
      }));
    return computeWalkDraftStats(reviewed);
  }, [responses]);

  const readyToComplete = allWalkItemsReviewed(
    templateItems.length,
    responses
      .filter((r) => r.status)
      .map((r) => ({
        itemId: r.itemId,
        label: r.label,
        status: r.status!,
        notes: r.notes.trim() || null,
        photoUrl: r.photoUrl,
      })),
  );

  function setStatus(itemId: string, status: WalkItemStatus) {
    setResponses((rows) => rows.map((row) => (row.itemId === itemId ? { ...row, status } : row)));
    setLocalErr(null);
  }

  function setNotes(itemId: string, notes: string) {
    setResponses((rows) => rows.map((row) => (row.itemId === itemId ? { ...row, notes } : row)));
  }

  async function onPhotoSelected(itemId: string, file: File | null) {
    if (!file) return;
    setUploadingItemId(itemId);
    setLocalErr(null);
    try {
      const uploaded = await uploadChatMedia(file);
      const preview = URL.createObjectURL(file);
      setResponses((rows) =>
        rows.map((row) =>
          row.itemId === itemId ? { ...row, photoUrl: uploaded.url, photoPreview: preview } : row,
        ),
      );
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : "Could not upload photo.");
    } finally {
      setUploadingItemId(null);
    }
  }

  function clearPhoto(itemId: string) {
    setResponses((rows) =>
      rows.map((row) =>
        row.itemId === itemId ? { ...row, photoUrl: null, photoPreview: null } : row,
      ),
    );
  }

  async function submit() {
    setLocalErr(null);
    if (!readyToComplete) {
      setLocalErr("Review every observation item before completing the walk.");
      return;
    }
    if (requireManagerName && !managerName.trim()) {
      setLocalErr("Enter your name so this walk is recorded.");
      return;
    }
    const payload: WalkItemResponse[] = responses.map((row) => ({
      itemId: row.itemId,
      label: row.label,
      status: row.status!,
      notes: row.notes.trim() || null,
      photoUrl: row.photoUrl,
    }));
    await onComplete({
      responses: payload,
      finalNotes: finalNotes.trim() || null,
    });
  }

  return (
    <div className="walk-run" data-testid="walk-run-panel">
      <header className="walk-run-head">
        <div>
          <p className="walk-run-kicker">Manager observation</p>
          <h2>{template.name}</h2>
          <p className="enterprise-muted">{template.workplace}</p>
        </div>
        <button type="button" className="walk-run-cancel" onClick={onCancel} disabled={busy}>
          Exit walk
        </button>
      </header>

      {requireManagerName ? (
        <div className="walk-run-manager">
          <label className="enterprise-alenio-go-alert-label" htmlFor="walk-manager-name">
            Your name
          </label>
          <input
            id="walk-manager-name"
            className="enterprise-alenio-go-alert-input"
            value={managerName}
            onChange={(e) => onManagerNameChange?.(e.target.value)}
            maxLength={120}
            placeholder="e.g. Alex M."
            required
          />
        </div>
      ) : null}

      <div className="walk-run-sections">
        {sections.map((section) => (
          <section key={section.id} className="walk-run-section">
            <header className="walk-run-section-head">
              <h3>{section.title}</h3>
              <span className="walk-run-section-count">
                {section.items.length} observation{section.items.length === 1 ? "" : "s"}
              </span>
            </header>
            <ol className="walk-run-items">
              {section.items.map((item) => {
                const row = responses.find((response) => response.itemId === item.id);
                if (!row) return null;
                const index = templateItems.findIndex((entry) => entry.id === item.id);
                return (
                  <li key={row.itemId} className="walk-run-item">
                    <div className="walk-run-item-head">
                      <span className="walk-run-item-index">{index + 1}</span>
                      <strong>{row.label}</strong>
                      {row.status ? (
                        <span className={walkStatusBadgeClass(row.status)}>{walkStatusLabel(row.status)}</span>
                      ) : null}
                    </div>

                    <div className="walk-run-status-row" role="group" aria-label={`Status for ${row.label}`}>
                      {(["pass", "needs_attention", "na"] as WalkItemStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={`walk-run-status-btn walk-run-status-btn--${status}${row.status === status ? " walk-run-status-btn--active" : ""}`}
                          disabled={busy}
                          onClick={() => setStatus(row.itemId, status)}
                        >
                          {walkStatusLabel(status)}
                        </button>
                      ))}
                    </div>

                    <label className="enterprise-alenio-go-alert-label" htmlFor={`walk-notes-${row.itemId}`}>
                      Notes (optional)
                    </label>
                    <textarea
                      id={`walk-notes-${row.itemId}`}
                      className="enterprise-alenio-go-alert-textarea walk-run-notes"
                      value={row.notes}
                      onChange={(e) => setNotes(row.itemId, e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Add context for this observation"
                    />

                    <div className="walk-run-photo-row">
                      {row.photoPreview ? (
                        <div className="walk-run-photo-preview">
                          <img src={row.photoPreview} alt="" />
                          <button type="button" className="walk-run-photo-clear" onClick={() => clearPhoto(row.itemId)}>
                            Remove photo
                          </button>
                        </div>
                      ) : (
                        <label className="walk-run-photo-upload">
                          <input
                            type="file"
                            accept="image/*"
                            disabled={busy || uploadingItemId === row.itemId}
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              e.target.value = "";
                              void onPhotoSelected(row.itemId, file);
                            }}
                          />
                          {uploadingItemId === row.itemId ? "Uploading…" : "Add photo (optional)"}
                        </label>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      <section className="walk-run-summary" aria-label="Walk completion summary">
        <h3>Completion summary</h3>
        <dl className="walk-run-summary-stats">
          <div>
            <dt>Items reviewed</dt>
            <dd>{stats.totalReviewed} / {templateItems.length}</dd>
          </div>
          <div>
            <dt>Pass</dt>
            <dd className="walk-run-summary-pass">{stats.passCount}</dd>
          </div>
          <div>
            <dt>Needs Attention</dt>
            <dd className="walk-run-summary-attention">{stats.needsAttentionCount}</dd>
          </div>
          <div>
            <dt>N/A</dt>
            <dd>{stats.naCount}</dd>
          </div>
          <div>
            <dt>Photos added</dt>
            <dd>{stats.photosCount}</dd>
          </div>
        </dl>

        <label className="enterprise-alenio-go-alert-label" htmlFor="walk-final-notes">
          Final notes (optional)
        </label>
        <textarea
          id="walk-final-notes"
          className="enterprise-alenio-go-alert-textarea"
          value={finalNotes}
          onChange={(e) => setFinalNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Overall observations, coaching notes, or next steps"
        />

        {localErr || error ? (
          <p className="enterprise-alenio-go-alert-error" role="alert">
            {localErr || error}
          </p>
        ) : null}

        <button
          type="button"
          className="walk-run-complete-btn"
          disabled={busy || !readyToComplete}
          onClick={() => void submit()}
          data-testid="walk-complete-btn"
        >
          {busy ? "Saving walk…" : "Complete Walk"}
        </button>
      </section>
    </div>
  );
}
