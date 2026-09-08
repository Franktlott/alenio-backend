export const WORKSPACE_LOCATION_MAX_LENGTH = 160;

export type WorkspaceLocationResult =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

export function normalizeWorkspaceLocation(value: unknown): WorkspaceLocationResult {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, message: "Workspace location must be a string or null" };
  }

  const normalized = value.trim();
  if (!normalized) return { ok: true, value: null };
  if (normalized.length > WORKSPACE_LOCATION_MAX_LENGTH) {
    return {
      ok: false,
      message: `Workspace location must be ${WORKSPACE_LOCATION_MAX_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, value: normalized };
}
