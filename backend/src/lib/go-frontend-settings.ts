import {
  DEFAULT_GO_ALERT_SOUND_PRESET,
  isGoAlertSoundPresetId,
  type GoAlertSoundPresetId,
} from "./go-alert-sounds";

export type GoAlertSoundSelection = GoAlertSoundPresetId | "custom";

export type GoFrontendSettings = {
  /** Override kiosk hero/header image. Null uses the workspace photo. */
  heroImageUrl: string | null;
  /** Built-in preset id or custom upload. */
  alertSoundPreset: GoAlertSoundSelection;
  /** Firebase URL when alertSoundPreset is custom. */
  alertSoundUrl: string | null;
};

export const DEFAULT_GO_FRONTEND_SETTINGS: GoFrontendSettings = {
  heroImageUrl: null,
  alertSoundPreset: DEFAULT_GO_ALERT_SOUND_PRESET,
  alertSoundUrl: null,
};

function parseHeroImageUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function parseAlertSoundPreset(value: unknown): GoAlertSoundSelection {
  if (value === "custom") return "custom";
  if (typeof value === "string" && isGoAlertSoundPresetId(value)) return value;
  return DEFAULT_GO_ALERT_SOUND_PRESET;
}

export function parseGoFrontendSettings(raw: string | null | undefined): GoFrontendSettings {
  if (!raw) return { ...DEFAULT_GO_FRONTEND_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<GoFrontendSettings>;
    return {
      heroImageUrl: parseHeroImageUrl(parsed.heroImageUrl),
      alertSoundPreset: parseAlertSoundPreset(parsed.alertSoundPreset),
      alertSoundUrl: parseHeroImageUrl(parsed.alertSoundUrl),
    };
  } catch {
    return { ...DEFAULT_GO_FRONTEND_SETTINGS };
  }
}

export function serializeGoFrontendSettings(settings: GoFrontendSettings): string | null {
  const payload: Partial<GoFrontendSettings> = {};
  const hero = settings.heroImageUrl?.trim();
  if (hero) payload.heroImageUrl = hero;

  if (settings.alertSoundPreset !== DEFAULT_GO_ALERT_SOUND_PRESET) {
    payload.alertSoundPreset = settings.alertSoundPreset;
  }
  if (settings.alertSoundPreset === "custom") {
    const custom = settings.alertSoundUrl?.trim();
    if (custom) payload.alertSoundUrl = custom;
  }

  if (Object.keys(payload).length === 0) return null;
  return JSON.stringify(payload);
}

export function parseGoFrontendSettingsPatch(
  body: unknown,
  current: GoFrontendSettings = DEFAULT_GO_FRONTEND_SETTINGS,
): { ok: true; value: GoFrontendSettings } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid Alenio Go frontend settings payload" };
  }
  const input = body as Partial<GoFrontendSettings>;
  const next: GoFrontendSettings = { ...current };

  if ("heroImageUrl" in input) {
    if (input.heroImageUrl !== undefined && input.heroImageUrl !== null) {
      if (typeof input.heroImageUrl !== "string" || !input.heroImageUrl.trim()) {
        return { ok: false, message: "Header image must be a valid URL or null" };
      }
      next.heroImageUrl = input.heroImageUrl.trim();
    } else {
      next.heroImageUrl = null;
    }
  }

  if ("alertSoundPreset" in input) {
    if (input.alertSoundPreset === "custom") {
      next.alertSoundPreset = "custom";
    } else if (
      typeof input.alertSoundPreset === "string" &&
      isGoAlertSoundPresetId(input.alertSoundPreset)
    ) {
      next.alertSoundPreset = input.alertSoundPreset;
      next.alertSoundUrl = null;
    } else if (input.alertSoundPreset != null) {
      return { ok: false, message: "Invalid alert sound selection" };
    }
  }

  if ("alertSoundUrl" in input) {
    if (input.alertSoundUrl === null) {
      next.alertSoundUrl = null;
    } else if (typeof input.alertSoundUrl === "string" && input.alertSoundUrl.trim()) {
      next.alertSoundUrl = input.alertSoundUrl.trim();
      next.alertSoundPreset = "custom";
    } else {
      return { ok: false, message: "Custom alert sound must be a valid URL or null" };
    }
  }

  if (next.alertSoundPreset === "custom" && !next.alertSoundUrl?.trim()) {
    return { ok: false, message: "Upload a custom alert sound or choose a preset" };
  }

  return { ok: true, value: next };
}

export function resolveGoHeroImage(
  teamImage: string | null | undefined,
  settings: GoFrontendSettings,
): string | null {
  const override = settings.heroImageUrl?.trim();
  if (override) return override;
  const workspace = teamImage?.trim();
  return workspace || null;
}
