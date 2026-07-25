import webIcon from "../../icon.png";

type Props = {
  /** Screen-reader label; visual text is optional. */
  label?: string;
};

export function AlenioWorkspaceLoading({ label = "Switching Workspace" }: Props) {
  return (
    <div className="alenio-workspace-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="alenio-workspace-loading-ring" aria-hidden>
        <span className="alenio-workspace-loading-spinner" />
        <img src={webIcon} alt="" className="alenio-workspace-loading-mark" width={48} height={48} />
      </div>
      <span className="alenio-workspace-loading-label">{label}</span>
    </div>
  );
}
