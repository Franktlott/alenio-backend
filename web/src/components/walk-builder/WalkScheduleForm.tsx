import { useMemo, useState } from "react";
import type { WalkSchedule } from "../../lib/walks/library-api";
import {
  DAY_LABELS,
  formatSchedulePreview,
  minutesToLabel,
  windowLabel,
} from "../../lib/walks/schedule-summary";

export type ScheduleRecurrence = "DAILY" | "WEEKLY" | "INTERVAL" | "ONCE";

export type WindowDraft = { start: string; due: string };

export type WalkScheduleFormValue = {
  name: string;
  recurrence: ScheduleRecurrence;
  daysOfWeek: number[];
  intervalMinutes: number;
  timezone: string;
  graceMinutes: number;
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
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseWindows(
  formWindows: WindowDraft[],
  graceMinutes = 30,
): Array<{ startMinutes: number; dueMinutes: number; graceMinutes: number }> {
  return formWindows
    .map((w) => {
      const startMinutes = timeInputToMinutes(w.start);
      const dueMinutes = timeInputToMinutes(w.due);
      if (startMinutes == null || dueMinutes == null) return null;
      return { startMinutes, dueMinutes, graceMinutes };
    })
    .filter((w): w is { startMinutes: number; dueMinutes: number; graceMinutes: number } => !!w);
}

export function defaultScheduleFormValue(): WalkScheduleFormValue {
  return {
    name: "",
    recurrence: "DAILY",
    daysOfWeek: [1, 2, 3, 4, 5],
    intervalMinutes: 240,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    graceMinutes: 30,
    windows: [
      { start: "06:00", due: "08:00" },
      { start: "14:00", due: "16:00" },
    ],
    assignScope: "WORKSPACE",
    assignRole: "",
    completionMode: "ANY_ONE",
  };
}

export function scheduleToFormValue(schedule: WalkSchedule): WalkScheduleFormValue {
  const grace = schedule.windows[0]?.graceMinutes ?? 30;
  return {
    name: schedule.name ?? "",
    recurrence:
      schedule.recurrence === "WEEKLY" ||
      schedule.recurrence === "INTERVAL" ||
      schedule.recurrence === "ONCE"
        ? schedule.recurrence
        : "DAILY",
    daysOfWeek: Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [1, 2, 3, 4, 5],
    intervalMinutes: schedule.intervalMinutes && schedule.intervalMinutes >= 15
      ? schedule.intervalMinutes
      : 240,
    timezone: schedule.timezone || "America/New_York",
    graceMinutes: grace,
    windows:
      schedule.windows.length > 0
        ? schedule.windows.map((w) => ({
            start: minutesToTimeInput(w.startMinutes),
            due: minutesToTimeInput(w.dueMinutes),
          }))
        : [{ start: "06:00", due: "08:00" }],
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

export function DayTimeline({
  windows,
}: {
  windows: Array<{ id?: string; startMinutes: number; dueMinutes: number }>;
}) {
  return (
    <div className="wsch-timeline" aria-label="Time windows per day">
      <div className="wsch-timeline-track">
        {windows.map((w, index) => {
          const start = w.startMinutes;
          let end = w.dueMinutes;
          if (end <= start) end = 24 * 60;
          const left = (start / (24 * 60)) * 100;
          const width = Math.max(2.5, ((end - start) / (24 * 60)) * 100);
          return (
            <div
              key={w.id ?? `${start}-${index}`}
              className="wsch-timeline-block"
              style={{ left: `${left}%`, width: `${width}%` }}
              title={windowLabel(w)}
            >
              <span>{windowLabel(w)}</span>
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
};

export function WalkScheduleForm({ value, onChange, showAssignment = false, disabled }: Props) {
  const parsedWindows = useMemo(
    () => parseWindows(value.windows, value.graceMinutes),
    [value.windows, value.graceMinutes],
  );

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

  function patch(partial: Partial<WalkScheduleFormValue>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="wsch-form">
      <label>
        Schedule name (optional)
        <input
          value={value.name}
          disabled={disabled}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Daily cooler checks"
        />
      </label>

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

      <label>
        Grace period (minutes)
        <input
          type="number"
          min={0}
          max={1440}
          value={value.graceMinutes}
          disabled={disabled}
          onChange={(e) => patch({ graceMinutes: Number(e.target.value) || 0 })}
        />
      </label>

      {value.recurrence !== "INTERVAL" ? (
        <div className="wsch-windows-edit">
          <div className="wsch-windows-edit-head">
            <strong>Run times</strong>
            <button
              type="button"
              className="wb-linkish"
              disabled={disabled}
              onClick={() =>
                patch({ windows: [...value.windows, { start: "09:00", due: "11:00" }] })
              }
            >
              + Add time
            </button>
          </div>
          {value.windows.map((w, index) => (
            <div key={index} className="wsch-window-row">
              <input
                type="time"
                value={w.start}
                disabled={disabled}
                onChange={(e) =>
                  patch({
                    windows: value.windows.map((row, i) =>
                      i === index ? { ...row, start: e.target.value } : row,
                    ),
                  })
                }
              />
              <span>due by</span>
              <input
                type="time"
                value={w.due}
                disabled={disabled}
                onChange={(e) =>
                  patch({
                    windows: value.windows.map((row, i) =>
                      i === index ? { ...row, due: e.target.value } : row,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="wil-row-menu"
                disabled={disabled || value.windows.length <= 1}
                onClick={() =>
                  patch({ windows: value.windows.filter((_, i) => i !== index) })
                }
                aria-label="Remove window"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="wsch-windows-edit">
          <div className="wsch-windows-edit-head">
            <strong>Day window</strong>
          </div>
          <div className="wsch-window-row">
            <input
              type="time"
              value={value.windows[0]?.start ?? "06:00"}
              disabled={disabled}
              onChange={(e) =>
                patch({
                  windows: [
                    {
                      start: e.target.value,
                      due: value.windows[0]?.due ?? "22:00",
                    },
                  ],
                })
              }
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
                      start: value.windows[0]?.start ?? "06:00",
                      due: e.target.value,
                    },
                  ],
                })
              }
            />
          </div>
          <p className="wil-muted" style={{ marginTop: "0.35rem" }}>
            Occurrences are generated every interval between these times (
            {minutesToLabel(timeInputToMinutes(value.windows[0]?.start ?? "06:00") ?? 360)}–
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
