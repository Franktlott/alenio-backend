/** Compact progress bar + label for row metadata. */
export function InlineProgress({ done, total, label, tone = "accent" }: { done: number; total: number; label?: string; tone?: "accent" | "success" }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className={`al-progress al-progress--${tone}`} role="img" aria-label={label ?? `${done} of ${total} done`}>
      <span className="al-progress-track" aria-hidden>
        <span className="al-progress-fill" style={{ width: `${percent}%` }} />
      </span>
      <span aria-hidden>{label ?? `${done}/${total}`}</span>
    </span>
  );
}
