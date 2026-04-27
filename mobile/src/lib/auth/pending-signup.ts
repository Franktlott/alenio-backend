// Temporary in-memory store for pending sign-up credentials.
// Used to auto-sign-in after email OTP verification.
// Never persisted to disk.
let pending: { email: string; password: string } | null = null;

export const setPendingSignUp = (email: string, password: string) => {
  pending = { email, password };
};

export const getPendingSignUp = () => pending;

export const clearPendingSignUp = () => {
  pending = null;
};
