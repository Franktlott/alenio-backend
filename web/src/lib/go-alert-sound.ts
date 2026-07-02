/** Short two-tone beep for Alenio Go workplace alerts (test / kiosk). */
export function playGoAlertSound(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    };
    playTone(880, ctx.currentTime, 0.22);
    playTone(1175, ctx.currentTime + 0.28, 0.28);
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    /* autoplay or audio unsupported */
  }
}
