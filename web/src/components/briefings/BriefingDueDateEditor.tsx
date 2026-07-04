import { useEffect, useState } from "react";
import { patchTeamBriefing } from "../../lib/api";
import { briefingDueDateInputValue } from "../../lib/briefings-display";

type Props = {
  teamId: string;
  briefingId: string;
  dueAt: string | null;
  signedCount?: number;
  onSaved?: (dueAt: string | null) => void;
};

export function BriefingDueDateEditor({ teamId, briefingId, dueAt, signedCount = 0, onSaved }: Props) {
  const [date, setDate] = useState(() => briefingDueDateInputValue(dueAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDate(briefingDueDateInputValue(dueAt));
  }, [dueAt]);

  const locked = signedCount >= 1;
  const dirty = date !== briefingDueDateInputValue(dueAt);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const nextDueAt = date ? new Date(`${date}T23:59:59`).toISOString() : null;
      const updated = await patchTeamBriefing(teamId, briefingId, { dueAt: nextDueAt });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
      onSaved?.(updated.dueAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update due date.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="briefing-due-editor" data-testid="briefing-due-date-editor">
      <h3 className="briefing-due-editor-title">Due date</h3>
      <p className="briefing-due-editor-copy enterprise-muted">
        {locked
          ? "Other briefing details are locked after the first signature. You can still update the due date."
          : "Change when this briefing is due for associates on linked tablets."}
      </p>
      <div className="briefing-due-editor-row">
        <input
          type="date"
          className="briefing-due-editor-input"
          value={date}
          disabled={busy}
          onChange={(e) => {
            setDate(e.target.value);
            setError(null);
            setSaved(false);
          }}
        />
        <button
          type="button"
          className="briefing-due-editor-clear"
          disabled={busy || !date}
          onClick={() => {
            setDate("");
            setError(null);
            setSaved(false);
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className="briefing-due-editor-save"
          disabled={busy || !dirty}
          onClick={() => void save()}
          data-testid="briefing-due-date-save"
        >
          {busy ? "Saving…" : "Save due date"}
        </button>
      </div>
      {error ? (
        <p className="enterprise-alenio-go-alert-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="briefing-due-editor-saved" role="status">
          Due date updated.
        </p>
      ) : null}
    </div>
  );
}
