import { useEffect, useState } from "react";
import { clampRecurrenceCount, formatRecurrenceRuleSummary, maxRecurrenceCount, recurrenceCountHint, recurrenceDurationUnit } from "../../lib/recurring-task";

const RECURRENCE_TYPES = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type RecurrenceSetupValues = {
  type: string;
  occurrenceCount: number;
  dayOfWeek: number;
  dayOfMonth: number;
};

type Props = {
  open: boolean;
  initial: RecurrenceSetupValues;
  onCancel: () => void;
  onSave: (values: RecurrenceSetupValues) => void;
};

export function TaskRecurrenceSetupModal({ open, initial, onCancel, onSave }: Props) {
  const [type, setType] = useState(initial.type);
  const [occurrenceCount, setOccurrenceCount] = useState(String(initial.occurrenceCount));
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek);
  const [dayOfMonth, setDayOfMonth] = useState(initial.dayOfMonth);

  useEffect(() => {
    if (!open) return;
    setType(initial.type);
    setOccurrenceCount(String(initial.occurrenceCount));
    setDayOfWeek(initial.dayOfWeek);
    setDayOfMonth(initial.dayOfMonth);
  }, [open, initial]);

  if (!open) return null;

  const count = clampRecurrenceCount(occurrenceCount, type);
  const preview = formatRecurrenceRuleSummary({
    type,
    occurrenceCount: count,
    dayOfWeek: type === "weekly" ? dayOfWeek : undefined,
    dayOfMonth: type === "monthly" ? dayOfMonth : undefined,
  });

  const handleSave = () => {
    onSave({
      type,
      occurrenceCount: count,
      dayOfWeek,
      dayOfMonth,
    });
  };

  return (
    <div className="enterprise-task-modal-backdrop enterprise-task-prompt-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="enterprise-task-prompt-modal create-v3-recurrence-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recurrence-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="recurrence-setup-title" className="enterprise-task-prompt-title">
          Repeating task
        </h3>
        <p className="enterprise-task-prompt-copy">Choose how often this task should repeat.</p>

        <div className="create-v3-recurrence-modal-body">
          <div className="enterprise-workspace-recurrence-types">
            {RECURRENCE_TYPES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`enterprise-workspace-recurrence-type${type === r.value ? " enterprise-workspace-recurrence-type--active" : ""}`}
                onClick={() => {
                  setType(r.value);
                  setOccurrenceCount(String(clampRecurrenceCount(occurrenceCount, r.value)));
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <label className="enterprise-create-recurrence-count">
            <span>Repeat for</span>
            <input
              className="auth-input enterprise-workspace-recurrence-interval"
              type="number"
              min={1}
              max={maxRecurrenceCount(type)}
              value={occurrenceCount}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setOccurrenceCount("");
                  return;
                }
                setOccurrenceCount(String(clampRecurrenceCount(raw, type)));
              }}
            />
            <span>{recurrenceDurationUnit(type)}</span>
          </label>
          <p className="enterprise-muted enterprise-workspace-recurrence-hint">{recurrenceCountHint(type)}</p>

          {type === "weekly" ? (
            <div className="enterprise-workspace-recurrence-weekdays">
              {WEEKDAYS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`enterprise-workspace-recurrence-weekday${dayOfWeek === index ? " enterprise-workspace-recurrence-weekday--active" : ""}`}
                  onClick={() => setDayOfWeek(index)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {type === "monthly" ? (
            <label className="enterprise-create-recurrence-count">
              <span>Day of month</span>
              <input
                className="auth-input enterprise-workspace-recurrence-interval"
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(parseInt(e.target.value, 10) || 1)}
              />
            </label>
          ) : null}

          <p className="create-v3-recurrence-preview">
            <span className="create-v3-recurrence-preview-label">Rule</span>
            {preview}
          </p>
        </div>

        <div className="enterprise-task-prompt-actions">
          <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-primary" onClick={handleSave}>
            Save rule
          </button>
        </div>
      </div>
    </div>
  );
}
