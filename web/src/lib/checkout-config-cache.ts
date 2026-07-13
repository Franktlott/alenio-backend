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

/** Server-wide Stripe checkout flags — cached for the session to avoid Plan tab flashes. */
export function loadWebCheckoutConfig(): Promise<WebCheckoutConfig> {
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
