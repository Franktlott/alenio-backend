import { useEffect, useState } from "react";
import { Button, Dialog, Field, Input, SegmentedControl } from "../ui";
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
    <Dialog
      open={open}
      onClose={onCancel}
      title="Repeating task"
      description="Choose how often this task should repeat."
      testId="task-recurrence-setup"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save rule
          </Button>
        </>
      }
    >
      <div className="al-form-stack">
        <SegmentedControl<string>
          label="Repeats"
          value={type}
          onChange={(next) => {
            setType(next);
            setOccurrenceCount(String(clampRecurrenceCount(occurrenceCount, next)));
          }}
          options={RECURRENCE_TYPES.map((r) => ({ value: r.value, label: r.label }))}
        />

        <Field label={`Repeat for (${recurrenceDurationUnit(type)})`} helper={recurrenceCountHint(type)}>
          <Input
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
        </Field>

        {type === "weekly" ? (
          <div className="al-field">
            <span className="al-field-label" id="recurrence-weekday-label">
              Day of week
            </span>
            <div className="al-chip-row" role="group" aria-labelledby="recurrence-weekday-label">
              {WEEKDAYS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={dayOfWeek === index}
                  className={`al-chip${dayOfWeek === index ? " is-on" : ""}`}
                  onClick={() => setDayOfWeek(index)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {type === "monthly" ? (
          <Field label="Day of month">
            <Input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(parseInt(e.target.value, 10) || 1)} />
          </Field>
        ) : null}

        <p className="al-rule-preview">
          <span className="al-rule-preview-label">Rule</span>
          {preview}
        </p>
      </div>
    </Dialog>
  );
}
