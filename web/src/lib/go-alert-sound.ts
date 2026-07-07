/** Kiosk alert audio — uses workspace sound files (requires user gesture on iPad). */
let soundUnlocked = false;
let pendingSoundLoop = false;
let pendingSoundUrl: string | null = null;
const unlockListeners = new Set<() => void>();

const ALERT_SOUND_PREF_KEY = "alenio.go.alertSoundEnabled";

let alertLoopAudio: HTMLAudioElement | null = null;
let alertLoopGeneration = 0;
let loadedSoundUrl: string | null = null;

export function hasGoAlertSoundPreference(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ALERT_SOUND_PREF_KEY) === "1";
}

function persistGoAlertSoundPreference(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ALERT_SOUND_PREF_KEY, "1");
}

function notifyUnlocked() {
  for (const listener of unlockListeners) {
    listener();
  }
}

function resolveSoundUrl(url: string): string {
  if (typeof window === "undefined") return url;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return url;
}

function getLoopAudio(soundUrl: string): HTMLAudioElement {
  const resolved = resolveSoundUrl(soundUrl);
  if (!alertLoopAudio || loadedSoundUrl !== resolved) {
    if (alertLoopAudio) {
      alertLoopAudio.pause();
      alertLoopAudio.src = "";
    }
    alertLoopAudio = new Audio(resolved);
    alertLoopAudio.preload = "auto";
    loadedSoundUrl = resolved;
  }
  return alertLoopAudio;
}

function markUnlocked() {
  if (soundUnlocked) return;
  soundUnlocked = true;
  persistGoAlertSoundPreference();
  notifyUnlocked();
  if (pendingSoundLoop && pendingSoundUrl) {
    const url = pendingSoundUrl;
    pendingSoundLoop = false;
    pendingSoundUrl = null;
    startGoAlertSoundLoopInternal(url);
  }
}

/** Synchronous unlock — call directly from click/touch handlers (required on iPad Safari). */
export function unlockGoAlertSoundFromGesture(): boolean {
  if (soundUnlocked) return true;
  if (typeof window === "undefined") return false;

  try {
    markUnlocked();
    return true;
  } catch {
    return false;
  }
}

export function isGoAlertSoundUnlocked(): boolean {
  return soundUnlocked;
}

export function onGoAlertSoundUnlocked(listener: () => void): () => void {
  unlockListeners.add(listener);
  if (soundUnlocked) listener();
  return () => unlockListeners.delete(listener);
}

/** Call from a tap/click so later alert polls can play sound (required on iPad Safari). */
export async function unlockGoAlertSound(): Promise<boolean> {
  if (soundUnlocked) return true;
  return unlockGoAlertSoundFromGesture();
}

let soundInitStarted = false;

/** Unlock on the next deliberate screen interaction anywhere on the kiosk. */
export function initGoAlertSound(): void {
  if (soundInitStarted || typeof window === "undefined") return;
  soundInitStarted = true;

  const onGesture = () => {
    if (soundUnlocked) return;
    unlockGoAlertSoundFromGesture();
  };

  window.addEventListener("pointerup", onGesture, { passive: true, capture: true });
  window.addEventListener("touchend", onGesture, { passive: true, capture: true });
}

function startGoAlertSoundLoopInternal(soundUrl: string): void {
  stopGoAlertSoundLoop();
  if (!soundUrl.trim()) return;

  alertLoopGeneration += 1;
  const audio = getLoopAudio(soundUrl);
  audio.loop = true;
  audio.currentTime = 0;

  void audio.play().catch(() => undefined);
  alertLoopAudio = audio;
}

/** Repeats the alert sound until stopGoAlertSoundLoop() is called. */
export function startGoAlertSoundLoop(soundUrl: string): void {
  if (!soundUrl.trim()) return;
  if (!soundUnlocked) {
    pendingSoundLoop = true;
    pendingSoundUrl = soundUrl;
    return;
  }
  startGoAlertSoundLoopInternal(soundUrl);
}

export function stopGoAlertSoundLoop(): void {
  pendingSoundLoop = false;
  pendingSoundUrl = null;
  alertLoopGeneration += 1;
  if (alertLoopAudio) {
    alertLoopAudio.pause();
    alertLoopAudio.currentTime = 0;
    alertLoopAudio.loop = false;
  }
}

/** @deprecated Use startGoAlertSoundLoop(soundUrl) */
export function playGoAlertSound(): void {
  /* legacy no-op */
}
