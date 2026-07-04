/** Shared audio context — must be resumed after a user gesture on iOS/iPadOS. */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioCtor();
  }
  return audioCtx;
}

/** Call from a tap/click so later alert polls can play sound (required on iPad Safari). */
export async function unlockGoAlertSound(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (ctx.state !== "running") return false;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.001);
    return true;
  } catch {
    return false;
  }
}

let soundInitStarted = false;

/** Prime alert audio on load and unlock silently on the next screen interaction. */
export function initGoAlertSound(): void {
  if (soundInitStarted || typeof window === "undefined") return;
  soundInitStarted = true;

  const tryUnlock = () => void unlockGoAlertSound();
  tryUnlock();
  window.setTimeout(tryUnlock, 400);
  window.setTimeout(tryUnlock, 2_000);

  const onGesture = () => void unlockGoAlertSound();
  window.addEventListener("pointerdown", onGesture, { passive: true });
  window.addEventListener("touchstart", onGesture, { passive: true });
  window.addEventListener("keydown", onGesture);
}

function scheduleAlertBeep(
  ctx: AudioContext,
  master: GainNode,
  freq: number,
  start: number,
  duration: number,
  peakGain: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.006);
  gain.gain.setValueAtTime(peakGain, start + duration - 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playAlertPattern(ctx: AudioContext, startAt: number) {
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  const peak = 0.92;
  const beepLen = 0.2;
  const gap = 0.1;
  const pattern = [880, 1320, 880, 1320, 1760, 1320, 1760, 1320];

  let t = startAt;
  for (const freq of pattern) {
    scheduleAlertBeep(ctx, master, freq, t, beepLen, peak);
    t += beepLen + gap;
  }

  t += 0.18;
  for (const freq of pattern) {
    scheduleAlertBeep(ctx, master, freq, t, beepLen, peak);
    t += beepLen + gap;
  }
}

/** Loud alternating beeps for Alenio Go workplace alerts (kiosk / tablet). */
export function playGoAlertSound(): void {
  void (async () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (ctx.state !== "running") return;

      playAlertPattern(ctx, ctx.currentTime);
    } catch {
      /* autoplay blocked or audio unsupported */
    }
  })();
}

/** One full alert pattern is ~5s; gap keeps repeats from overlapping. */
const ALERT_LOOP_GAP_MS = 5_500;

let alertLoopTimer: ReturnType<typeof setTimeout> | null = null;

/** Repeats the alert sound until stopGoAlertSoundLoop() is called. */
export function startGoAlertSoundLoop(): void {
  stopGoAlertSoundLoop();
  const tick = () => {
    playGoAlertSound();
    alertLoopTimer = window.setTimeout(tick, ALERT_LOOP_GAP_MS);
  };
  tick();
}

export function stopGoAlertSoundLoop(): void {
  if (alertLoopTimer !== null) {
    window.clearTimeout(alertLoopTimer);
    alertLoopTimer = null;
  }
}
