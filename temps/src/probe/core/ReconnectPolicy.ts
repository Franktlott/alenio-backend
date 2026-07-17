export type ReconnectPolicyOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  /**
   * Fraction of delay used as symmetric jitter (±).
   * Example: 0.2 → delay * (1 ± 0.2 * randomSigned).
   */
  jitterRatio?: number;
  /**
   * Returns a number in [0, 1). Injectable / seedable for stable tests.
   * Default: Math.random.
   */
  random?: () => number;
};

/**
 * Exponential backoff with optional jitter.
 * `nextDelayMs(attempt)` uses 0-based attempt index (0 = first reconnect).
 * Returns null when attempts are exhausted.
 */
export class ReconnectPolicy {
  readonly maxAttempts: number;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly multiplier: number;
  private readonly jitterRatio: number;
  private readonly random: () => number;

  constructor(options: ReconnectPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.initialDelayMs = options.initialDelayMs ?? 250;
    this.maxDelayMs = options.maxDelayMs ?? 10_000;
    this.multiplier = options.multiplier ?? 2;
    this.jitterRatio = options.jitterRatio ?? 0.2;
    this.random = options.random ?? Math.random;
  }

  /**
   * @param attempt 0-based reconnect attempt index
   * @returns delay in ms, or null if no further attempts
   */
  nextDelayMs(attempt: number): number | null {
    if (attempt < 0 || attempt >= this.maxAttempts) {
      return null;
    }

    const base = Math.min(
      this.initialDelayMs * this.multiplier ** attempt,
      this.maxDelayMs,
    );

    if (this.jitterRatio <= 0) {
      return Math.round(base);
    }

    const unit = this.random();
    const signed = unit * 2 - 1; // [-1, 1)
    const jittered = base * (1 + signed * this.jitterRatio);
    return Math.max(0, Math.round(jittered));
  }
}

/** Deterministic PRNG for tests (mulberry32). */
export function createSeededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
