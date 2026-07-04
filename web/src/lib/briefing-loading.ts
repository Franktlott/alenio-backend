/** Minimum time the Alenio Go briefing loader stays visible. */
export const GO_BRIEFING_LOADING_MIN_MS = 1_400;

export async function waitForBriefingLoadingMin(startedAt: number): Promise<void> {
  const remaining = GO_BRIEFING_LOADING_MIN_MS - (Date.now() - startedAt);
  if (remaining <= 0) return;
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, remaining);
  });
}
