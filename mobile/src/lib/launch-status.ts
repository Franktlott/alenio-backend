/** Cold-start phases that drive LaunchScreen copy. */
export type LaunchPhase =
  | "boot"
  | "session"
  | "workspace"
  | "network"
  | "today"
  | "finish";

/** Lines rotate within a phase; `finish` holds until Home is revealed. */
export const LAUNCH_PHASE_LINES: Record<LaunchPhase, readonly string[]> = {
  boot: ["Starting Alenio…", "Waking things up…"],
  session: ["Checking your account…", "Signing you in…"],
  workspace: ["Loading your workspace…", "Finding your teams…"],
  network: ["Loading your network…", "Gathering your connections…"],
  today: ["Building your day…", "Checking today’s schedule…"],
  finish: ["Opening Home…"],
};

export function launchStatusLine(phase: LaunchPhase, tick: number): string {
  const lines = LAUNCH_PHASE_LINES[phase];
  return lines[tick % lines.length] ?? lines[0]!;
}
