import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { WebMeUser } from "../lib/api";
import { JoinRequestBell } from "./JoinRequestBell";
import { VideoMeetingTopBarJoin } from "./VideoMeetingTopBarJoin";
export type TopBarWorkspaceCallout = {
  kind: "read_only";
  canChoosePlan: boolean;
};

type Props = {
  user: WebMeUser | null;
  pageTitle: string;
  pageSubtitle?: string;
  selectedTeamId?: string;
  /** Optional brand mark shown above the page title (e.g. Alenio Go logo). */
  brandHeader?: ReactNode;
  /** Alenio Go dashboard styling — borderless header on grey background. */
  variant?: "default" | "go";
  /** Extra content before bell/profile (e.g. Go workspace status). */
  actionsPrefix?: ReactNode;
  workspaceCallout?: TopBarWorkspaceCallout | null;
};

export function DashboardTopBar({
  user,
  pageTitle,
  pageSubtitle,
  selectedTeamId = "",
  brandHeader,
  variant = "default",
  actionsPrefix,
  workspaceCallout = null,
}: Props) {
  const isGo = variant === "go";

  return (
    <header
      className={`enterprise-topbar${isGo ? " enterprise-topbar--go" : ""}${pageSubtitle ? " enterprise-topbar--with-subtitle" : ""}`}
      data-testid="dashboard-topbar"
    >
      <div className="enterprise-topbar-context" data-testid="topbar-context">
        {brandHeader ? (
          <>
            {brandHeader}
            <h1 className="sr-only">{pageTitle}</h1>
          </>
        ) : (
          <div className="enterprise-topbar-context-copy">
            <h1 className="enterprise-topbar-title">{pageTitle}</h1>
            {pageSubtitle ? <p className="enterprise-topbar-subtitle">{pageSubtitle}</p> : null}
          </div>
        )}
        {workspaceCallout?.kind === "read_only" ? (
          <p className="enterprise-topbar-callout" role="status" data-testid="workspace-access-banner">
            <span>Read-only</span>
            {workspaceCallout.canChoosePlan ? (
              <Link to="/billing">Choose a plan</Link>
            ) : (
              <span className="enterprise-topbar-callout-hint">Ask the owner to upgrade</span>
            )}
          </p>
        ) : null}
      </div>

      <div className="enterprise-topbar-actions">
        {!isGo ? <VideoMeetingTopBarJoin selectedTeamId={selectedTeamId} user={user} /> : null}
        {actionsPrefix}
        <JoinRequestBell />
      </div>
    </header>
  );
}
