import { AlenioWorkspaceLoading } from "./AlenioWorkspaceLoading";

type Props = {
  label?: string;
  fullScreen?: boolean;
  className?: string;
  testId?: string;
};

export function EnterprisePageLoading({
  label = "Loading your workspace",
  fullScreen = false,
  className = "",
  testId,
}: Props) {
  const classes = [
    "enterprise-page-loading",
    fullScreen ? "enterprise-page-loading--fullscreen" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="status" aria-live="polite" aria-busy="true" data-testid={testId}>
      <AlenioWorkspaceLoading label={label} />
    </div>
  );
}
