import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOneOnOneTemplates,
  patchWebTeamWorkplaceStandards,
  type OneOnOneTemplate,
} from "../lib/api";
import {
  DEFAULT_WORKPLACE_STANDARDS,
  formatCheckInFrequencySummary,
  formatGracePeriodSummary,
  formatRequiredTemplateSummary,
  type CheckInFrequencyUnit,
  type WorkplaceStandards,
} from "../lib/workplace-standards";

type Props = {
  teamId: string;
  open: boolean;
  initialStandards: WorkplaceStandards;
  initialTemplateTitle?: string | null;
  onClose: () => void;
  onSaved: (standards: WorkplaceStandards, templateTitle: string | null) => void;
};

const FREQUENCY_UNITS: { value: CheckInFrequencyUnit; label: string }[] = [
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
  { value: "months", label: "months" },
];

export function WorkplaceStandardsModal({
  teamId,
  open,
  initialStandards,
  onClose,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<WorkplaceStandards>(initialStandards);
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initialStandards);
    setErr(null);
  }, [open, initialStandards]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchOneOnOneTemplates(teamId);
      setTemplates(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load templates.");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (!open) return;
    void loadTemplates();
  }, [open, loadTemplates]);

  const selectedTemplateTitle = useMemo(() => {
    if (!draft.requiredCheckInTemplateId) return null;
    return templates.find((t) => t.id === draft.requiredCheckInTemplateId)?.title ?? null;
  }, [draft.requiredCheckInTemplateId, templates]);

  const onSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      const saved = await patchWebTeamWorkplaceStandards(teamId, draft);
      const title = saved.requiredCheckInTemplateId
        ? templates.find((t) => t.id === saved.requiredCheckInTemplateId)?.title ?? null
        : null;
      onSaved(saved, title);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save workplace standards.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-modal-sheet enterprise-workplace-standards-modal"
        role="dialog"
        aria-label="Workplace standards"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>

        <header className="enterprise-workplace-standards-head">
          <p className="enterprise-overview-kicker">Workspace</p>
          <h3 className="enterprise-workplace-standards-title">Workplace Standards</h3>
          <p className="enterprise-muted enterprise-workplace-standards-sub">
            Set check-in and development expectations for this workspace.
          </p>
        </header>

        <div className="enterprise-workplace-standards-form">
          <section className="enterprise-workplace-standards-section">
            <div className="enterprise-workplace-standards-toggle-row">
              <div>
                <span className="enterprise-workplace-standards-label">Check-in required</span>
                <p className="enterprise-muted enterprise-workplace-standards-hint">
                  Team members must complete check-ins on schedule.
                </p>
              </div>
              <label className="enterprise-workplace-standards-switch">
                <input
                  type="checkbox"
                  checked={draft.checkInRequired}
                  onChange={(e) => setDraft((prev) => ({ ...prev, checkInRequired: e.target.checked }))}
                />
                <span aria-hidden />
              </label>
            </div>

            {draft.checkInRequired ? (
              <>
                <label className="enterprise-workplace-standards-field">
                  <span className="enterprise-workplace-standards-label">Check-in frequency</span>
                  <div className="enterprise-workplace-standards-frequency">
                    <span className="enterprise-workplace-standards-frequency-prefix">Every</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={draft.checkInFrequencyValue}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          checkInFrequencyValue: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                    />
                    <select
                      value={draft.checkInFrequencyUnit}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          checkInFrequencyUnit: e.target.value as CheckInFrequencyUnit,
                        }))
                      }
                    >
                      {FREQUENCY_UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label className="enterprise-workplace-standards-field">
                  <span className="enterprise-workplace-standards-label">Grace period</span>
                  <div className="enterprise-workplace-standards-grace">
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={draft.checkInGracePeriodDays}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          checkInGracePeriodDays: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                    />
                    <span className="enterprise-workplace-standards-grace-suffix">days after due date</span>
                  </div>
                </label>

                <label className="enterprise-workplace-standards-field">
                  <span className="enterprise-workplace-standards-label">Required check-in template</span>
                  <select
                    value={draft.requiredCheckInTemplateId ?? ""}
                    disabled={loading}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        requiredCheckInTemplateId: e.target.value || null,
                      }))
                    }
                  >
                    <option value="">Any template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.title}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
          </section>

          <section className="enterprise-workplace-standards-section">
            <div className="enterprise-workplace-standards-toggle-row">
              <div>
                <span className="enterprise-workplace-standards-label">Development goals required</span>
                <p className="enterprise-muted enterprise-workplace-standards-hint">
                  Team members must maintain active development goals.
                </p>
              </div>
              <label className="enterprise-workplace-standards-switch">
                <input
                  type="checkbox"
                  checked={draft.goalsRequired}
                  onChange={(e) => setDraft((prev) => ({ ...prev, goalsRequired: e.target.checked }))}
                />
                <span aria-hidden />
              </label>
            </div>

            {draft.goalsRequired ? (
              <label className="enterprise-workplace-standards-field">
                <span className="enterprise-workplace-standards-label">Minimum active goals</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={draft.minimumActiveGoals}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      minimumActiveGoals: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </label>
            ) : null}
          </section>

          <div className="enterprise-workplace-standards-preview">
            <p className="enterprise-workplace-standards-label">Summary</p>
            <ul className="enterprise-workplace-standards-preview-list">
              <li>
                <span>Check-in frequency</span>
                <strong>{formatCheckInFrequencySummary(draft)}</strong>
              </li>
              <li>
                <span>Required active goals</span>
                <strong>{draft.goalsRequired ? draft.minimumActiveGoals : "Not required"}</strong>
              </li>
              <li>
                <span>Grace period</span>
                <strong>{formatGracePeriodSummary(draft.checkInGracePeriodDays)}</strong>
              </li>
              <li>
                <span>Required template</span>
                <strong>{formatRequiredTemplateSummary(selectedTemplateTitle)}</strong>
              </li>
            </ul>
          </div>
        </div>

        {err ? (
          <p className="enterprise-form-error" role="alert">
            {err}
          </p>
        ) : null}

        <footer className="enterprise-workplace-standards-footer">
          <button type="button" className="enterprise-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="enterprise-btn-primary" onClick={() => void onSave()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function mergeWorkplaceStandards(
  standards?: WorkplaceStandards | null,
): WorkplaceStandards {
  if (!standards) return { ...DEFAULT_WORKPLACE_STANDARDS };
  return { ...DEFAULT_WORKPLACE_STANDARDS, ...standards };
}
