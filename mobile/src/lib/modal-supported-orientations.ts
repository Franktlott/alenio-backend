/**
 * Orientations a full-screen Modal may take.
 *
 * React Native's iOS Modal defaults to portrait-only on phone idiom. On an
 * open Duo that collapses the spanned window back to one leaf (black void on
 * the other). Allow every orientation so the host window can stay full-span.
 */
export const MODAL_SUPPORTED_ORIENTATIONS = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right",
] as const;
