/** Shared Better Auth runtime status for /health (no heavy imports). */
let betterAuthMounted = false;

export function setBetterAuthMounted(mounted: boolean): void {
  betterAuthMounted = mounted;
}

export function isBetterAuthMounted(): boolean {
  return betterAuthMounted;
}
