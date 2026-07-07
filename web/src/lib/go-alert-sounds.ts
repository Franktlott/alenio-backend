export const GO_ALERT_SOUND_PRESETS = [
  {
    id: "classic-bell",
    label: "Classic bell",
    description: "Clear bell tone for general alerts",
    path: "/sounds/alert-classic-bell.mp3",
  },
  {
    id: "store-chime",
    label: "Store chime",
    description: "Bright chime for customer-facing areas",
    path: "/sounds/alert-store-chime.mp3",
  },
  {
    id: "urgent-tone",
    label: "Urgent tone",
    description: "Higher-attention tone for urgent messages",
    path: "/sounds/alert-urgent-tone.mp3",
  },
] as const;

export type GoAlertSoundPresetId = (typeof GO_ALERT_SOUND_PRESETS)[number]["id"];

export type GoAlertSoundSelection = GoAlertSoundPresetId | "custom";

export const DEFAULT_GO_ALERT_SOUND_PRESET: GoAlertSoundPresetId = "classic-bell";

const PRESET_PATHS = new Map(GO_ALERT_SOUND_PRESETS.map((preset) => [preset.id, preset.path]));

export function isGoAlertSoundPresetId(value: string): value is GoAlertSoundPresetId {
  return PRESET_PATHS.has(value as GoAlertSoundPresetId);
}

export function resolveGoAlertSoundUrl(settings: {
  alertSoundPreset?: GoAlertSoundSelection | null;
  alertSoundUrl?: string | null;
}): string {
  const preset = settings.alertSoundPreset ?? DEFAULT_GO_ALERT_SOUND_PRESET;
  if (preset === "custom") {
    const custom = settings.alertSoundUrl?.trim();
    if (custom) return custom;
  }
  const presetPath = PRESET_PATHS.get(
    preset === "custom" ? DEFAULT_GO_ALERT_SOUND_PRESET : preset,
  );
  return presetPath ?? PRESET_PATHS.get(DEFAULT_GO_ALERT_SOUND_PRESET)!;
}

export function resolveAbsoluteGoAlertSoundUrl(url: string): string {
  if (typeof window === "undefined") return url;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return url;
}

export function previewGoAlertSoundUrl(url: string): void {
  const audio = new Audio(resolveAbsoluteGoAlertSoundUrl(url));
  audio.preload = "auto";
  void audio.play().catch(() => undefined);
}
