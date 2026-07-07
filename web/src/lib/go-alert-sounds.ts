/** Soft Alenio workplace alert tone — gentle ascending chime, not an alarm. */
export const ALENIO_ALERT_SOUND_PATH = "/sounds/alenio-alert.wav";

export function resolveGoAlertSoundUrl(): string {
  return ALENIO_ALERT_SOUND_PATH;
}

export function resolveAbsoluteGoAlertSoundUrl(url: string = ALENIO_ALERT_SOUND_PATH): string {
  if (typeof window === "undefined") return url;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return url;
}

export function previewGoAlertSoundUrl(url: string = ALENIO_ALERT_SOUND_PATH): void {
  const audio = new Audio(resolveAbsoluteGoAlertSoundUrl(url));
  audio.preload = "auto";
  void audio.play().catch(() => undefined);
}
