import {
  STANDARDS_BADGE_LEGEND,
  standardsBadgeClassName,
  type StandardsBadgeVariant,
} from "../lib/workplace-standards";

const STANDARDS_STATUS_KEY_ORDER: StandardsBadgeVariant[] = [
  "on_track",
  "check_in_due_soon",
  "overdue_check_in",
  "no_check_in",
  "needs_active_goals",
];

export function StandardsStatusKey() {
  const items = STANDARDS_STATUS_KEY_ORDER.map((variant) =>
    STANDARDS_BADGE_LEGEND.find((entry) => entry.variant === variant),
  ).filter((entry): entry is (typeof STANDARDS_BADGE_LEGEND)[number] => Boolean(entry));

  return (
    <details className="enterprise-standards-status-key">
      <summary>Status key</summary>
      <ul>
        {items.map((item) => (
          <li key={item.variant}>
            <span className={standardsBadgeClassName(item.variant)}>{item.label}</span>
            <span>{item.description}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
