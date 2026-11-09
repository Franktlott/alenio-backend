type ConnectionPreviewCandidate = {
  activeNow: boolean;
};

const MAX_PREVIEW_CONNECTIONS = 6;
const MAX_ACTIVE_CONNECTIONS = 2;

/**
 * Builds the compact connections preview without allowing extra active entries
 * to displace the highest-ranked non-active connections.
 */
export function selectConnectionPreview<T extends ConnectionPreviewCandidate>(
  connections: readonly T[],
): T[] {
  const active = connections
    .filter((connection) => connection.activeNow)
    .slice(0, MAX_ACTIVE_CONNECTIONS);
  const nonActive = connections
    .filter((connection) => !connection.activeNow)
    .slice(0, MAX_PREVIEW_CONNECTIONS - active.length);

  return [...active, ...nonActive];
}
