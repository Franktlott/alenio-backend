import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import {
  activityActorName,
  fetchWorkspaceOverviewUpdates,
  type WorkspaceActivity,
} from "../../lib/workspace-feed-api";
import { timeAgo } from "../../lib/network-api";

type Props = {
  teamId: string;
  onViewAll?: () => void;
};

function overviewRowCopy(item: WorkspaceActivity): {
  title: string;
  subtitle: string;
} {
  const actor = activityActorName(item);
  const meta = item.metadata;

  switch (item.type) {
    case "calendar_event_added": {
      const titles = (meta as { eventTitles?: string[] } | null)?.eventTitles;
      const eventTitle = titles?.[0]?.trim() || "an event";
      return {
        title: eventTitle,
        subtitle: `${actor} added “${eventTitle}” to the calendar.`,
      };
    }
    case "member_joined": {
      const name = meta?.userName?.trim() || actor;
      return {
        title: `${name} joined`,
        subtitle: "New member joined the team.",
      };
    }
    case "member_removed": {
      const name = meta?.userName?.trim() || actor;
      return {
        title: `${name} left`,
        subtitle: "Member left the team.",
      };
    }
    case "task_assigned": {
      const taskTitle =
        (meta as { taskTitles?: string[]; taskTitle?: string } | null)
          ?.taskTitles?.[0] ||
        (meta as { taskTitle?: string } | null)?.taskTitle ||
        "a task";
      return {
        title: taskTitle,
        subtitle: `${actor} was assigned a task.`,
      };
    }
    case "task_milestone":
      return {
        title: meta?.taskTitle?.trim() || "Milestone reached",
        subtitle: `${actor} hit a task milestone.`,
      };
    case "celebration": {
      const toName = meta?.targetName?.trim() || "a teammate";
      return {
        title: `Recognized ${toName}`,
        subtitle: meta?.message?.trim() || `${actor} recognized ${toName}.`,
      };
    }
    case "post":
      return {
        title: "Workspace update",
        subtitle: meta?.body?.trim() || `${actor} shared an update.`,
      };
    case "development_goal_completed":
      return {
        title:
          (meta as { goalTitle?: string } | null)?.goalTitle?.trim() ||
          "Development goal completed",
        subtitle: `${actor} completed a development goal.`,
      };
    case "check_in_completed": {
      const memberName = (meta as { memberName?: string } | null)?.memberName;
      return {
        title: "Check-in completed",
        subtitle: memberName
          ? `Check-in with ${memberName}.`
          : `${actor} published a check-in.`,
      };
    }
    default:
      return {
        title: "Workspace activity",
        subtitle: `${actor} posted an update.`,
      };
  }
}

export function WorkspaceOverviewRecentUpdates({ teamId, onViewAll }: Props) {
  const query = useQuery({
    queryKey: ["workspace", "overview-recent-updates", teamId],
    queryFn: () => fetchWorkspaceOverviewUpdates(teamId, 3),
    enabled: Boolean(teamId),
  });

  const items = query.data?.items ?? [];

  return (
    <section
      className="ws-overview-recent"
      data-testid="workspace-overview-recent-updates"
    >
      <header className="ws-overview-recent-head">
        <h2 className="ws-overview-recent-title">Recent Updates</h2>
        {onViewAll ? (
          <button
            type="button"
            className="ws-overview-recent-view-all"
            onClick={onViewAll}
            data-testid="workspace-overview-recent-updates-view-all"
          >
            View All
            <ArrowRight size={14} strokeWidth={2.4} />
          </button>
        ) : null}
      </header>

      {query.isLoading ? (
        <p className="ws-overview-recent-empty">Loading updates…</p>
      ) : query.isError ? (
        <p className="ws-overview-recent-empty">
          Couldn’t load updates.{" "}
          <button
            type="button"
            className="ws-overview-recent-retry"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </p>
      ) : items.length === 0 ? (
        <div className="ws-overview-recent-empty-block">
          <p className="ws-overview-recent-empty-title">Nothing new yet.</p>
          <p className="ws-overview-recent-empty">
            Important workspace activity will appear here as your team gets
            moving.
          </p>
        </div>
      ) : (
        <ul className="ws-overview-recent-list">
          {items.map((item, index) => {
            const { title, subtitle } = overviewRowCopy(item);
            const isFirst = index === 0;
            const isLast = index === items.length - 1;
            return (
              <li
                key={item.id}
                className={`ws-overview-recent-row${isFirst ? " is-first" : ""}${isLast ? " is-last" : ""}`}
              >
                <span className="ws-overview-recent-rail" aria-hidden>
                  <span className="ws-overview-recent-dot" />
                </span>
                <div className="ws-overview-recent-row-copy">
                  <div className="ws-overview-recent-row-top">
                    <p className="ws-overview-recent-row-title">{title}</p>
                    <p className="ws-overview-recent-row-time">
                      {timeAgo(item.createdAt)}
                    </p>
                  </div>
                  <p className="ws-overview-recent-row-body">{subtitle}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
