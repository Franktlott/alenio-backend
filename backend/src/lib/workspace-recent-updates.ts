import { canViewCalendarEvent } from "./calendar-permissions";
import { canManageWorkspaceRelationships } from "./workspace-role-policy";
import { parseActivityMetadata } from "./workspace-activity-feed";

/** High-signal types shown on Workspace Overview → Recent Updates. */
export const OVERVIEW_RECENT_UPDATE_TYPES = [
  "post",
  "celebration",
  "task_milestone",
  "calendar_event_added",
  "development_goal_completed",
  "check_in_completed",
  "member_joined",
] as const;

export type OverviewRecentUpdateType =
  (typeof OVERVIEW_RECENT_UPDATE_TYPES)[number];

const OVERVIEW_TYPE_SET = new Set<string>(OVERVIEW_RECENT_UPDATE_TYPES);

export function isOverviewRecentUpdateType(type: string): boolean {
  return OVERVIEW_TYPE_SET.has(type);
}

export function parseActivityTypesQuery(
  raw: string | undefined,
): string[] | null {
  if (!raw?.trim()) return null;
  const types = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return types.length > 0 ? types : null;
}

function stringMeta(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayMeta(
  metadata: Record<string, unknown> | null,
  key: string,
): string[] {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

export type OverviewVisibilityContext = {
  viewerUserId: string;
  viewerRole: string;
  /**
   * eventId → visibility fields for calendar_event_added filtering.
   * Missing ids are treated as not viewable for overview.
   */
  eventsById: Map<
    string,
    {
      isHidden: boolean;
      approvalStatus?: string | null;
      createdById: string;
      isVideoMeeting?: boolean;
      isOneOnOne?: boolean;
      assigneeIds: string[];
    }
  >;
};

/**
 * Whether an activity row may appear on Overview (and similarly scoped lists)
 * for this viewer. Membership is assumed already checked.
 */
export function activityVisibleOnOverview(
  activity: {
    type: string;
    userId: string | null;
    metadata: string | null;
  },
  ctx: OverviewVisibilityContext,
): boolean {
  if (!isOverviewRecentUpdateType(activity.type)) return false;

  const metadata = parseActivityMetadata(activity.metadata);

  if (activity.type === "development_goal_completed") {
    if (canManageWorkspaceRelationships(ctx.viewerRole)) return true;
    const target =
      stringMeta(metadata, "targetUserId") ??
      stringMeta(metadata, "memberUserId");
    return target === ctx.viewerUserId;
  }

  if (activity.type === "check_in_completed") {
    if (canManageWorkspaceRelationships(ctx.viewerRole)) return true;
    const memberId = stringMeta(metadata, "memberUserId");
    const managerId = stringMeta(metadata, "managerUserId");
    return (
      memberId === ctx.viewerUserId || managerId === ctx.viewerUserId
    );
  }

  if (activity.type === "calendar_event_added") {
    const eventIds = [
      ...stringArrayMeta(metadata, "eventIds"),
      ...(stringMeta(metadata, "eventId")
        ? [stringMeta(metadata, "eventId")!]
        : []),
    ];
    // Legacy rows without event ids were only logged for approved team events.
    if (eventIds.length === 0) return true;

    return eventIds.some((eventId) => {
      const event = ctx.eventsById.get(eventId);
      if (!event) return false;
      return canViewCalendarEvent(
        event,
        ctx.viewerUserId,
        ctx.viewerRole,
        event.assigneeIds,
      );
    });
  }

  return true;
}

export function collectOverviewEventIds(
  activities: Array<{ type: string; metadata: string | null }>,
): string[] {
  const ids = new Set<string>();
  for (const activity of activities) {
    if (activity.type !== "calendar_event_added") continue;
    const metadata = parseActivityMetadata(activity.metadata);
    for (const id of stringArrayMeta(metadata, "eventIds")) ids.add(id);
    const single = stringMeta(metadata, "eventId");
    if (single) ids.add(single);
  }
  return [...ids];
}
