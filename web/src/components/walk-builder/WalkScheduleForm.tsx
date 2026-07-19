import { useMemo, useState } from "react";
import type { WalkSchedule } from "../../lib/walks/library-api";
import {
  DAY_LABELS,
  formatSchedulePreview,
  minutesToLabel,
  windowLabel,
} from "../../lib/walks/schedule-summary";

export type ScheduleRecurrence = "DAILY" | "WEEKLY" | "INTERVAL" | "ONCE";

/** Completion window options: 0–5 hours in 15-minute steps. */
export const COMPLETION_WINDOW_MAX_MINUTES = 5 * 60;
export const COMPLETION_WINDOW_STEP_MINUTES = 15;
export const COMPLETION_WINDOW_OPTIONS: number[] = Array.from(
  { length: COMPLETION_WINDOW_MAX_MINUTES / COMPLETION_WINDOW_STEP_MINUTES + 1 },
  (_, i) => i * COMPLETION_WINDOW_STEP_MINUTES,
);

export function formatCompletionWindowLabel(minutes: number) {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours} hr${hours === 1 ? "" : "s"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} hr ${m} min`;
}

/** Snap any minute value onto the 15-minute dropdown grid (0–5 hours). */
export function snapCompletionWindowMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const clamped = Math.min(COMPLETION_WINDOW_MAX_MINUTES, Math.max(0, value));
  return Math.round(clamped / COMPLETION_WINDOW_STEP_MINUTES) * COMPLETION_WINDOW_STEP_MINUTES;
}

/** One due time with a completion window before/after. */
export type WindowDraft = {
  due: string;
  beforeMinutes: number;
  afterMinutes: number;
};

export type WalkScheduleFormValue = {
  /** Kept for compatibility; schedules use the checklist name on save. */
  name: string;
  recurrence: ScheduleRecurrence;
  daysOfWeek: number[];
  intervalMinutes: number;
  timezone: string;
  /** INTERVAL only: start of the active day range. */
  intervalDayStart: string;
  windows: WindowDraft[];
  assignScope: "WORKSPACE" | "ROLE" | "MEMBER" | "TEAM" | "ANY";
  assignRole: string;
  completionMode: "ANY_ONE" | "EVERY_ASSIGNEE";
};

export function timeInputToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToTimeInput(minutes: number) {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function clampMinutes(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return snapCompletionWindowMinutes(value);
}

export function CompletionWindowSelect({
  value,
  disabled,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: number;
  disabled?: boolean;
  onChange: (minutes: number) => void;
  "aria-label"?: string;
}) {
  const snapped = snapCompletionWindowMinutes(value);
  return (
    <select
      aria-label={ariaLabel}
      value={String(snapped)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {COMPLETION_WINDOW_OPTIONS.map((minutes) => (
        <option key={minutes} value={minutes}>
          {formatCompletionWindowLabel(minutes)}
        </option>
      ))}
    </select>
  );
}

/** Map due-time drafts → API windows (open = due − before, grace = after). */
export function parseWindows(
  formWindows: WindowDraft[],
): Array<{ startMinutes: number; dueMinutes: number; graceMinutes: number }> {
  return formWindows
    .map((w) => {
      const dueMinutes = timeInputToMinutes(w.due);
      if (dueMinutes == null) return null;
      const before = clampMinutes(w.beforeMinutes, 0);
      const after = clampMinutes(w.afterMinutes, 0);
      const startMinutes = Math.max(0, dueMinutes - before);
      return { startMinutes, dueMinutes, graceMinutes: after };
    })
    .filter((w): w is { startMinutes: number; dueMinutes: number; graceMinutes: number } => !!w);
}

const DAY_MINUTES = 24 * 60;

/** Inclusive-open / exclusive-close completion range for one due time. */
export function completionRange(window: {
  startMinutes: number;
  dueMinutes: number;
  graceMinutes?: number;
}): { open: number; close: number } {
  const open = Math.max(0, Math.min(DAY_MINUTES, window.startMinutes));
  const close = Math.max(
    open,
    Math.min(DAY_MINUTES, window.dueMinutes + (window.graceMinutes ?? 0)),
  );
  return { open, close };
}

function rangesOverlap(
  a: { open: number; close: number },
  b: { open: number; close: number },
) {
  return a.open < b.close && b.open < a.close;
}

/**
 * Returns a human-readable error when any due-time completion windows overlap.
 * Adjacent windows that only touch at an endpoint are allowed.
 */
export function findWindowOverlapError(
  windows: Array<{ startMinutes: number; dueMinutes: number; graceMinutes?: number }>,
): string | null {
  if (windows.length < 2) return null;
  const ranked = windows
    .map((w, index) => ({ index, ...completionRange(w), dueMinutes: w.dueMinutes }))
    .sort((a, b) => a.open - b.open || a.close - b.close);

  for (let i = 0; i < ranked.length - 1; i += 1) {
    const current = ranked[i]!;
    const next = ranked[i + 1]!;
    if (rangesOverlap(current, next)) {
      return `Completion windows overlap for ${minutesToLabel(current.dueMinutes)} and ${minutesToLabel(next.dueMinutes)}. Adjust before/after times so they don’t overlap.`;
    }
  }
  return null;
}

export function findDraftWindowOverlapError(formWindows: WindowDraft[]): string | null {
  return findWindowOverlapError(parseWindows(formWindows));
}

/** Indexes of draft windows whose completion ranges overlap another window. */
export function findOverlappingWindowIndexes(formWindows: WindowDraft[]): Set<number> {
  const ranges = parseWindows(formWindows).map((w, index) => ({
    index,
    ...completionRange(w),
  }));
  const overlapping = new Set<number>();
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      if (rangesOverlap(a, b)) {
        overlapping.add(a.index);
        overlapping.add(b.index);
      }
    }
  }
  return overlapping;
}

/** INTERVAL day range as a single API window (grace from first due draft). */
export function parseIntervalWindow(
  dayStart: string,
  dayEnd: string,
  afterMinutes = 0,
): Array<{ startMinutes: number; dueMinutes: number; graceMinutes: number }> {
  const startMinutes = timeInputToMinutes(dayStart);
  const dueMinutes = timeInputToMinutes(dayEnd);
  if (startMinutes == null || dueMinutes == null) return [];
  return [
    {
      startMinutes,
      dueMinutes,
      graceMinutes: clampMinutes(afterMinutes, 0),
    },
  ];
}

export function defaultScheduleFormValue(): WalkScheduleFormValue {
  return {
    name: "",
    recurrence: "DAILY",
    daysOfWeek: [1, 2, 3, 4, 5],
    intervalMinutes: 240,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    intervalDayStart: "06:00",
    windows: [
      { due: "08:00", beforeMinutes: 120, afterMinutes: 30 },
      { due: "16:00", beforeMinutes: 120, afterMinutes: 30 },
    ],
    assignScope: "WORKSPACE",
    assignRole: "",
    completionMode: "ANY_ONE",
  };
}

export function scheduleToFormValue(schedule: WalkSchedule): WalkScheduleFormValue {
  const sorted = [...(schedule.windows ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const first = sorted[0];
  return {
    name: schedule.name ?? "",
    recurrence:
      schedule.recurrence === "WEEKLY" ||
      schedule.recurrence === "INTERVAL" ||
      schedule.recurrence === "ONCE"
        ? schedule.recurrence
        : "DAILY",
    daysOfWeek: Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [1, 2, 3, 4, 5],
    intervalMinutes:
      schedule.intervalMinutes && schedule.intervalMinutes >= 15 ? schedule.intervalMinutes : 240,
    timezone: schedule.timezone || "America/New_York",
    intervalDayStart: first ? minutesToTimeInput(first.startMinutes) : "06:00",
    windows:
      sorted.length > 0
        ? sorted.map((w) => ({
            due: minutesToTimeInput(w.dueMinutes),
            beforeMinutes: snapCompletionWindowMinutes(w.dueMinutes - w.startMinutes),
            afterMinutes: snapCompletionWindowMinutes(w.graceMinutes ?? 0),
          }))
        : [{ due: "08:00", beforeMinutes: 120, afterMinutes: 30 }],
    assignScope:
      schedule.assignScope === "ROLE" ||
      schedule.assignScope === "MEMBER" ||
      schedule.assignScope === "TEAM" ||
      schedule.assignScope === "ANY"
        ? schedule.assignScope
        : "WORKSPACE",
    assignRole: schedule.assignRole ?? "",
    completionMode: schedule.completionMode === "EVERY_ASSIGNEE" ? "EVERY_ASSIGNEE" : "ANY_ONE",
  };
}

function completionHint(w: WindowDraft) {
  const due = timeInputToMinutes(w.due);
  if (due == null) return "Enter a due time.";
  const before = clampMinutes(w.beforeMinutes, 0);
  const after = clampMinutes(w.afterMinutes, 0);
  const open = Math.max(0, due - before);
  const late = Math.min(24 * 60 - 1, due + after);
  return `Opens ${minutesToLabel(open)} · Due ${minutesToLabel(due)} · Late until ${minutesToLabel(late)}`;
}

export function DayTimeline({
  windows,
}: {
  windows: Array<{ id?: string; startMinutes: number; dueMinutes: number; graceMinutes?: number }>;
}) {
  return (
    <div className="wsch-timeline" aria-label="Completion windows per day">
      <div className="wsch-timeline-track">
        {windows.map((w, index) => {
          const start = w.startMinutes;
          let end = w.dueMinutes + (w.graceMinutes ?? 0);
          if (end <= start) end = 24 * 60;
          end = Math.min(end, 24 * 60);
          const left = (start / (24 * 60)) * 100;
          const width = Math.max(2.5, ((end - start) / (24 * 60)) * 100);
          return (
            <div
              key={w.id ?? `${start}-${index}`}
              className="wsch-timeline-block"
              style={{ left: `${left}%`, width: `${width}%` }}
              title={windowLabel(w)}
            >
              <span>{minutesToLabel(w.dueMinutes)}</span>
            </div>
          );
        })}
      </div>
      <div className="wsch-timeline-labels">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
      </div>
    </div>
  );
}

type Props = {
  value: WalkScheduleFormValue;
  onChange: (next: WalkScheduleFormValue) => void;
  showAssignment?: boolean;
  disabled?: boolean;
  /** Checklist name shown so leaders know the schedule inherits it. */
  checklistName?: string;
};

export function WalkScheduleForm({
  value,
  onChange,
  showAssignment = false,
  disabled,
  checklistName,
}: Props) {
  const parsedWindows = useMemo(() => {
    if (value.recurrence === "INTERVAL") {
      return parseIntervalWindow(
        value.intervalDayStart,
        value.windows[0]?.due ?? "22:00",
        value.windows[0]?.afterMinutes ?? 0,
      );
    }
    return parseWindows(value.windows);
  }, [value.recurrence, value.intervalDayStart, value.windows]);

  const preview = useMemo(
    () =>
      formatSchedulePreview({
        recurrence: value.recurrence,
        daysOfWeek: value.daysOfWeek,
        intervalMinutes: value.intervalMinutes,
        windows: parsedWindows,
      }),
    [value.recurrence, value.daysOfWeek, value.intervalMinutes, parsedWindows],
  );

  const overlapError = useMemo(() => {
    if (value.recurrence === "INTERVAL") return null;
    return findWindowOverlapError(parsedWindows);
  }, [value.recurrence, parsedWindows]);

  const overlappingIndexes = useMemo(() => {
    if (value.recurrence === "INTERVAL") return new Set<number>();
    return findOverlappingWindowIndexes(value.windows);
  }, [value.recurrence, value.windows]);

  function patch(partial: Partial<WalkScheduleFormValue>) {
    onChange({ ...value, ...partial });
  }

  function patchWindow(index: number, partial: Partial<WindowDraft>) {
    patch({
      windows: value.windows.map((row, i) => (i === index ? { ...row, ...partial } : row)),
    });
  }

  return (
    <div className="wsch-form">
      {checklistName?.trim() ? (
        <p className="wsch-form-checklist-name">
          Schedule for <strong>{checklistName.trim()}</strong>
        </p>
      ) : null}

      <label>
        Schedule type
        <select
          value={value.recurrence}
          disabled={disabled}
          onChange={(e) => patch({ recurrence: e.target.value as ScheduleRecurrence })}
        >
          <option value="DAILY">Daily at selected times</option>
          <option value="WEEKLY">Selected days of the week</option>
          <option value="INTERVAL">Repeating interval</option>
          <option value="ONCE">One-time</option>
        </select>
      </label>

      {value.recurrence === "WEEKLY" ? (
        <div className="wsch-days">
          {DAY_LABELS.map((label, index) => {
            const on = value.daysOfWeek.includes(index);
            return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                className={`wsch-day${on ? " is-on" : ""}`}
                onClick={() =>
                  patch({
                    daysOfWeek: on
                      ? value.daysOfWeek.filter((d) => d !== index)
                      : [...value.daysOfWeek, index].sort(),
                  })
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {value.recurrence === "INTERVAL" ? (
        <label>
          Interval
          <select
            value={String(value.intervalMinutes)}
            disabled={disabled}
            onChange={(e) => patch({ intervalMinutes: Number(e.target.value) })}
          >
            <option value="120">Every 2 hours</option>
            <option value="240">Every 4 hours</option>
            <option value="360">Every 6 hours</option>
            <option value="480">Every 8 hours</option>
          </select>
        </label>
      ) : null}

      <label>
        Time zone
        <input
          value={value.timezone}
          disabled={disabled}
          onChange={(e) => patch({ timezone: e.target.value })}
          placeholder="America/New_York"
        />
      </label>

      {value.recurrence !== "INTERVAL" ? (
        <div className="wsch-windows-edit">
          <div className="wsch-windows-edit-head">
            <strong>Due times</strong>
            <button
              type="button"
              className="wb-linkish"
              disabled={disabled}
              onClick={() =>
                patch({
                  windows: [
                    ...value.windows,
                    { due: "12:00", beforeMinutes: 60, afterMinutes: 30 },
                  ],
                })
              }
            >
              + Add
            </button>
          </div>
          <div className="wsch-due-table" role="table" aria-label="Due times">
            <div className="wsch-due-table-head" role="row">
              <span role="columnheader">Due</span>
              <span role="columnheader">Before</span>
              <span role="columnheader">After</span>
              <span className="sr-only" role="columnheader">
                Remove
              </span>
            </div>
            {value.windows.map((w, index) => (
              <div
                key={index}
                className={`wsch-due-row${overlappingIndexes.has(index) ? " is-overlap" : ""}`}
                role="row"
                title={completionHint(w)}
              >
                <input
                  type="time"
                  role="cell"
                  value={w.due}
                  disabled={disabled}
                  aria-label={`Due time ${index + 1}`}
                  onChange={(e) => patchWindow(index, { due: e.target.value })}
                />
                <CompletionWindowSelect
                  aria-label={`Minutes before due ${index + 1}`}
                  value={w.beforeMinutes}
                  disabled={disabled}
                  onChange={(beforeMinutes) => patchWindow(index, { beforeMinutes })}
                />
                <CompletionWindowSelect
                  aria-label={`Minutes after due ${index + 1}`}
                  value={w.afterMinutes}
                  disabled={disabled}
                  onChange={(afterMinutes) => patchWindow(index, { afterMinutes })}
                />
                <button
                  type="button"
                  className="wsch-due-remove"
                  disabled={disabled || value.windows.length <= 1}
                  onClick={() => patch({ windows: value.windows.filter((_, i) => i !== index) })}
                  aria-label={`Remove due time ${index + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {overlapError ? (
            <p className="wsch-overlap-error" role="alert">
              {overlapError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="wsch-windows-edit">
          <div className="wsch-windows-edit-head">
            <strong>Active hours</strong>
          </div>
          <div className="wsch-window-row">
            <input
              type="time"
              value={value.intervalDayStart}
              disabled={disabled}
              onChange={(e) => patch({ intervalDayStart: e.target.value })}
            />
            <span>through</span>
            <input
              type="time"
              value={value.windows[0]?.due ?? "22:00"}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  windows: [
                    {
                      due: e.target.value,
                      beforeMinutes: 0,
                      afterMinutes: value.windows[0]?.afterMinutes ?? 30,
                    },
                  ],
                })
              }
            />
          </div>
          <label>
            Time allowed after each due time
            <CompletionWindowSelect
              aria-label="Minutes after due"
              value={value.windows[0]?.afterMinutes ?? 30}
              disabled={disabled}
              onChange={(afterMinutes) =>
                patch({
                  windows: [
                    {
                      due: value.windows[0]?.due ?? "22:00",
                      beforeMinutes: 0,
                      afterMinutes,
                    },
                  ],
                })
              }
            />
          </label>
          <p className="wil-muted" style={{ marginTop: "0.35rem" }}>
            Occurrences are generated every interval between these times (
            {minutesToLabel(timeInputToMinutes(value.intervalDayStart) ?? 360)}–
            {minutesToLabel(timeInputToMinutes(value.windows[0]?.due ?? "22:00") ?? 1320)}).
          </p>
        </div>
      )}

      {parsedWindows.length > 0 && value.recurrence !== "INTERVAL" ? (
        <DayTimeline windows={parsedWindows} />
      ) : null}

      <p className="wil-subtitle" style={{ marginTop: "0.75rem" }}>
        {preview}
      </p>

      {showAssignment ? (
        <>
          <label>
            Assigned to
            <select
              value={value.assignScope}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  assignScope: e.target.value as WalkScheduleFormValue["assignScope"],
                })
              }
            >
              <option value="WORKSPACE">All associates</option>
              <option value="ROLE">By role</option>
              <option value="MEMBER">Selected members</option>
              <option value="ANY">Anyone</option>
            </select>
          </label>
          {value.assignScope === "ROLE" ? (
            <label>
              Role
              <input
                value={value.assignRole}
                disabled={disabled}
                onChange={(e) => patch({ assignRole: e.target.value })}
                placeholder="e.g. Associate"
              />
            </label>
          ) : null}
          <label>
            Completion
            <select
              value={value.completionMode}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  completionMode: e.target.value as WalkScheduleFormValue["completionMode"],
                })
              }
            >
              <option value="ANY_ONE">Any one assignee</option>
              <option value="EVERY_ASSIGNEE">Every assignee</option>
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}

/** Controlled wrapper that keeps local draft state until parent saves. */
export function useScheduleFormState(initial?: WalkScheduleFormValue) {
  return useState<WalkScheduleFormValue>(initial ?? defaultScheduleFormValue());
}
