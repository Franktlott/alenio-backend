import type { KeyboardEvent, ReactNode } from "react";

export type SegmentOption<V extends string> = {
  value: V;
  label: ReactNode;
  count?: number;
  testId?: string;
};

/** Left/Right/Home/End move selection between tabs and focus the new one. */
export function tabListKeyDown<V extends string>(e: KeyboardEvent<HTMLElement>, values: V[], value: V, onChange: (v: V) => void) {
  const i = values.indexOf(value);
  let next = -1;
  if (e.key === "ArrowRight") next = (i + 1) % values.length;
  else if (e.key === "ArrowLeft") next = (i - 1 + values.length) % values.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = values.length - 1;
  if (next < 0) return;
  e.preventDefault();
  onChange(values[next]);
  const tabs = e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
  tabs[next]?.focus();
}

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  label,
  quiet = false,
}: {
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  quiet?: boolean;
}) {
  return (
    <div
      className={`al-seg${quiet ? " al-seg--quiet" : ""}`}
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => tabListKeyDown(e, options.map((o) => o.value), value, onChange)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={`al-seg-btn${on ? " is-on" : ""}`}
            onClick={() => onChange(o.value)}
            data-testid={o.testId}
          >
            {o.label}
            {o.count !== undefined ? <span className="al-seg-count">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<V extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
}) {
  return (
    <div className="al-tabs" role="tablist" aria-label={label} onKeyDown={(e) => tabListKeyDown(e, tabs.map((t) => t.value), value, onChange)}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={`al-tab${on ? " is-on" : ""}`}
            onClick={() => onChange(t.value)}
            data-testid={t.testId}
          >
            {t.label}
            {t.count !== undefined ? <span className="al-seg-count">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
