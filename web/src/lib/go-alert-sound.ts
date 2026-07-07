import { ALENIO_ALERT_SOUND_PATH } from "./go-alert-sounds";

/** Kiosk alert audio — uses workspace sound files (requires user gesture on iPad). */
let soundUnlocked = false;
let pendingSoundLoop = false;
let pendingSoundUrl: string | null = null;
let workspaceAlertSoundUrl: string | null = ALENIO_ALERT_SOUND_PATH;
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

function primeAlertAudio(soundUrl: string): void {
  const audio = getLoopAudio(soundUrl);
  audio.loop = false;
  audio.muted = true;
  audio.volume = 1;
  audio.currentTime = 0;
  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    })
    .catch(() => {
      audio.muted = false;
    });
}

export function setGoAlertSoundWorkspaceUrl(url: string | null | undefined): void {
  workspaceAlertSoundUrl = url?.trim() || ALENIO_ALERT_SOUND_PATH;
}

export function getGoAlertSoundWorkspaceUrl(): string {
  return workspaceAlertSoundUrl || ALENIO_ALERT_SOUND_PATH;
}

function markUnlocked(soundUrl?: string | null) {
  if (soundUnlocked) return;
  soundUnlocked = true;
  persistGoAlertSoundPreference();
  notifyUnlocked();
  if (pendingSoundLoop) {
    const url = pendingSoundUrl ?? soundUrl ?? getGoAlertSoundWorkspaceUrl();
    pendingSoundLoop = false;
    pendingSoundUrl = null;
    if (url) startGoAlertSoundLoopInternal(url);
  }
}

/** Synchronous unlock — call directly from click/touch handlers (required on iPad Safari). */
export function unlockGoAlertSoundFromGesture(soundUrl?: string | null): boolean {
  if (soundUnlocked) return true;
  if (typeof window === "undefined") return false;

  const url = soundUrl?.trim() || getGoAlertSoundWorkspaceUrl();
  try {
    primeAlertAudio(url);
    markUnlocked(url);
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
export async function unlockGoAlertSound(soundUrl?: string | null): Promise<boolean> {
  if (soundUnlocked) return true;
  return unlockGoAlertSoundFromGesture(soundUrl);
}

let soundInitStarted = false;

/** Unlock on the next deliberate screen interaction anywhere on the kiosk. */
export function initGoAlertSound(): void {
  if (soundInitStarted || typeof window === "undefined") return;
  soundInitStarted = true;
  workspaceAlertSoundUrl = workspaceAlertSoundUrl || ALENIO_ALERT_SOUND_PATH;

  const onGesture = () => {
    if (soundUnlocked) return;
    unlockGoAlertSoundFromGesture(getGoAlertSoundWorkspaceUrl());
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
  audio.muted = false;
  audio.currentTime = 0;
  alertLoopAudio = audio;
  void audio.play().catch(() => undefined);
}

/** Repeats the alert sound until stopGoAlertSoundLoop() is called. */
export function startGoAlertSoundLoop(soundUrl?: string | null): void {
  const url = soundUrl?.trim() || getGoAlertSoundWorkspaceUrl();
  if (!url) return;
  if (!soundUnlocked) {
    pendingSoundLoop = true;
    pendingSoundUrl = url;
    return;
  }
  startGoAlertSoundLoopInternal(url);
}

export function stopGoAlertSoundLoop(): void {
  pendingSoundLoop = false;
  pendingSoundUrl = null;
  alertLoopGeneration += 1;
  if (alertLoopAudio) {
    alertLoopAudio.pause();
    alertLoopAudio.currentTime = 0;
    alertLoopAudio.loop = false;
    alertLoopAudio.muted = false;
  }
}

/** @deprecated Use startGoAlertSoundLoop(soundUrl) */
export function playGoAlertSound(): void {
  /* legacy no-op */
}
