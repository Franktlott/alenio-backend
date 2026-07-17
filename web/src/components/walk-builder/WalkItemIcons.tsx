import type { WalkItemType } from "../../lib/walks/types";
import type { WalkPaletteCard } from "../../lib/walks/item-catalog";

export function WalkTypeIcon({
  type,
  icon,
  size = 20,
}: {
  type?: WalkItemType;
  icon?: WalkPaletteCard["icon"];
  size?: number;
}) {
  const kind =
    icon ??
    (type === "TEMPERATURE"
      ? "temp"
      : type === "YES_NO"
        ? "yesno"
        : type === "MULTIPLE_CHOICE"
          ? "choice"
          : type === "VISUAL_CHECK"
            ? "visual"
            : type === "QUANTITY"
              ? "quantity"
              : type === "PHOTO"
                ? "photo"
                : "text");

  if (kind === "temp") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    );
  }
  if (kind === "yesno") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l2.5 2.5L16 9" />
      </svg>
    );
  }
  if (kind === "choice") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <circle cx="4" cy="6" r="1.2" fill="currentColor" />
        <circle cx="4" cy="12" r="1.2" fill="currentColor" />
        <circle cx="4" cy="18" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "visual") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (kind === "quantity") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M4 7h4l2-3h4l2 3h4v13H4z" />
        <text x="8" y="16" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">
          123
        </text>
      </svg>
    );
  }
  if (kind === "photo") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}
