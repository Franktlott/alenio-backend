import { AlenioWorkspaceLoading } from "../AlenioWorkspaceLoading";

type Props = {
  label?: string;
};

export function GoBriefingLoadingOverlay({ label = "Loading briefing…" }: Props) {
  return (
    <div
      className="go-briefing-loading-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="go-briefing-loading-overlay"
    >
      <AlenioWorkspaceLoading label={label} />
    </div>
  );
}
