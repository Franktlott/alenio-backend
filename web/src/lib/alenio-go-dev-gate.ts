/** Flip to false when Alenio Go is ready for general access. Disabled — Go is gated by Operations plan. */
export const ALENIO_GO_DEV_GATE_ENABLED = false;

export const ALENIO_GO_DEV_CODE = "Lotttechnologies2026";

const STORAGE_KEY = "alenio.go.devUnlocked";

export function isAlenioGoDevUnlocked(): boolean {
  if (!ALENIO_GO_DEV_GATE_ENABLED) return true;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function tryUnlockAlenioGoDev(code: string): boolean {
  if (code.trim() === ALENIO_GO_DEV_CODE) {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* still unlock for this session */
    }
    return true;
  }
  return false;
}
