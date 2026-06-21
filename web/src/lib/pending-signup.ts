const STORAGE_KEY = "alenio:pending-signup";

export type PendingSignUp = { email: string; password: string };

export function setPendingSignUp(email: string, password: string): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ email: email.trim().toLowerCase(), password }),
    );
  } catch {
    /* ignore */
  }
}

export function getPendingSignUp(): PendingSignUp | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSignUp;
    if (!parsed?.email || !parsed?.password) return null;
    return { email: parsed.email.trim().toLowerCase(), password: parsed.password };
  } catch {
    return null;
  }
}

export function clearPendingSignUp(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
