type ReadOnlyListener = (teamId?: string) => void;

const listeners = new Set<ReadOnlyListener>();

export function subscribeToWorkspaceReadOnly(listener: ReadOnlyListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyWorkspaceReadOnly(teamId?: string): void {
  for (const listener of listeners) listener(teamId);
}
