import { fetchWebCheckoutConfig } from "./api";

export type WebCheckoutConfig = {
  configured: boolean;
  missingKeys: string[];
  plans?: { pro: boolean; operations: boolean };
};

let cache: WebCheckoutConfig | null = null;
let inflight: Promise<WebCheckoutConfig> | null = null;

export function peekWebCheckoutConfig(): WebCheckoutConfig | null {
  return cache;
}

export function clearWebCheckoutConfigCache(): void {
  cache = null;
}

/** Server-wide Stripe checkout flags — cached briefly to avoid Plan tab flashes. */
export function loadWebCheckoutConfig(opts?: { force?: boolean }): Promise<WebCheckoutConfig> {
  if (opts?.force) cache = null;
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetchWebCheckoutConfig()
      .then((data) => {
        cache = data;
        return data;
      })
      .catch(() => {
        const fallback: WebCheckoutConfig = {
          configured: false,
          missingKeys: [],
          plans: { pro: false, operations: false },
        };
        cache = fallback;
        return fallback;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
