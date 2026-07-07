import {
  DEFAULT_GO_ALERT_SOUND_PRESET,
  type GoAlertSoundSelection,
} from "./go-alert-sounds";

export type GoFrontendSettings = {
  heroImageUrl: string | null;
  alertSoundPreset: GoAlertSoundSelection;
  alertSoundUrl: string | null;
};

export const DEFAULT_GO_FRONTEND_SETTINGS: GoFrontendSettings = {
  heroImageUrl: null,
  alertSoundPreset: DEFAULT_GO_ALERT_SOUND_PRESET,
  alertSoundUrl: null,
};

export function resolveGoHeroImage(
  teamImage: string | null | undefined,
  settings: GoFrontendSettings | null | undefined,
): string | null {
  const override = settings?.heroImageUrl?.trim();
  if (override) return override;
  const workspace = teamImage?.trim();
  return workspace || null;
}

export function isUsingWorkspaceHeroImage(settings: GoFrontendSettings | null | undefined): boolean {
  return !settings?.heroImageUrl?.trim();
}

export function goFrontendSettingsEqual(
  a: GoFrontendSettings | null | undefined,
  b: GoFrontendSettings | null | undefined,
): boolean {
  const heroA = a?.heroImageUrl?.trim() || null;
  const heroB = b?.heroImageUrl?.trim() || null;
  const presetA = a?.alertSoundPreset ?? DEFAULT_GO_ALERT_SOUND_PRESET;
  const presetB = b?.alertSoundPreset ?? DEFAULT_GO_ALERT_SOUND_PRESET;
  const soundA = a?.alertSoundUrl?.trim() || null;
  const soundB = b?.alertSoundUrl?.trim() || null;
  return heroA === heroB && presetA === presetB && soundA === soundB;
}

export function normalizeGoFrontendSettings(
  settings: Partial<GoFrontendSettings> | null | undefined,
): GoFrontendSettings {
  return {
    heroImageUrl: settings?.heroImageUrl?.trim() || null,
    alertSoundPreset: settings?.alertSoundPreset ?? DEFAULT_GO_ALERT_SOUND_PRESET,
    alertSoundUrl: settings?.alertSoundUrl?.trim() || null,
  };
}
