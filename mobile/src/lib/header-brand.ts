/** Solid Alenio brand fill shared by every brand-toned header. */
export const HEADER_BRAND_COLOR = "#4361EE";

/** Icon color for light (white) headers. */
export const HEADER_LIGHT_ICON_COLOR = "#000000";

/**
 * Header icons are drawn at 34-38pt to keep the bar compact, which is under the
 * 44pt touch target iOS expects. This slop brings every one of them past 44 in
 * both directions without changing how the header looks. Horizontal slop stays
 * at 5 so neighbouring icons, which sit 10pt apart, never claim each other's
 * taps.
 */
export const HEADER_BUTTON_HIT_SLOP = { top: 10, bottom: 10, left: 5, right: 5 };
