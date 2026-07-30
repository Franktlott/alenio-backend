/** Canonical unique key for a 1:1 DM between two users. */
export function buildDmPairKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(":");
}
