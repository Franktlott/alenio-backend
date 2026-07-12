export type ActivityDateGroup = "today" | "yesterday" | "this_week" | "earlier";

export type ActivityFilter = "all" | "tasks" | "calendar" | "team" | "celebrations";

export type ActivityFeedType =
  | "task_completed"
  | "member_joined"
  | "member_removed"
  | "calendar_event_added"
  | "task_assigned"
  | "task_milestone"
  | "personal_best"
  | "celebration";

export type ActivityReactionUser = { id: string; name: string };

export type ActivityReactions = Record<
  string,
  { count: number; userIds: string[]; users: ActivityReactionUser[] }
>;

export type ActivityMetadata = {
  taskTitle?: string;
  taskTitles?: string[];
  taskCount?: number;
  eventTitle?: string;
  eventTitles?: string[];
  eventCount?: number;
  startDate?: string;
  endDate?: string | null;
  allDay?: boolean;
  userName?: string;
  count?: number;
  incognito?: boolean;
  assigneeName?: string;
  isVideoMeeting?: boolean;
  targetUserId?: string;
  targetName?: string;
  targetUserImage?: string | null;
  celebrationType?: string;
  message?: string | null;
  assignees?: { id: string; name: string; image: string | null }[];
};

export type ActivityApiEvent = {
  id: string;
  type: ActivityFeedType;
  createdAt: string;
  metadata: ActivityMetadata | null;
  user: { id: string; name: string; image: string | null } | null;
  reactions: ActivityReactions;
};

export type ActivityActionRoute = {
  pathname: string;
  params?: Record<string, string>;
};

export type ActivityFeedItem = {
  id: string;
  type: ActivityFeedType;
  actor: { id: string; name: string; image: string | null } | null;
  title: string;
  description?: string;
  timestamp: string;
  dateGroup: ActivityDateGroup;
  metadata: ActivityMetadata;
  actionLabel?: string;
  actionRoute?: ActivityActionRoute;
  reactions: ActivityReactions;
};

export type ActivityDateSection = {
  group: ActivityDateGroup;
  label: string;
  items: ActivityFeedItem[];
};

export type ActivitySummary = {
  updates: number;
  tasks: number;
  events: number;
};

export const ACTIVITY_FILTER_OPTIONS: { key: ActivityFilter; label: string }[] = [
  { key: "all", label: "All Activity" },
  { key: "tasks", label: "Tasks" },
  { key: "calendar", label: "Calendar" },
  { key: "team", label: "Team" },
  { key: "celebrations", label: "Celebrations" },
];

const DATE_GROUP_ORDER: ActivityDateGroup[] = ["today", "yesterday", "this_week", "earlier"];

function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function getDateGroup(iso: string): ActivityDateGroup {
  const date = new Date(iso);
  const now = new Date();
  const today = startOfDay(now);
  const eventDay = startOfDay(date);
  const diffDays = Math.floor((today.getTime() - eventDay.getTime()) / 86400000);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  if (eventDay >= weekAgo) return "this_week";
  return "earlier";
}

export function dateGroupLabel(group: ActivityDateGroup): string {
  switch (group) {
    case "today":
      return "TODAY";
    case "yesterday":
      return "YESTERDAY";
    case "this_week":
      return "THIS WEEK";
    case "earlier":
      return "EARLIER";
  }
}

export function matchesActivityFilter(type: ActivityFeedType, filter: ActivityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "tasks") {
    return type === "task_completed" || type === "task_assigned";
  }
  if (filter === "calendar") return type === "calendar_event_added";
  if (filter === "team") return type === "member_joined" || type === "member_removed";
  if (filter === "celebrations") {
    return type === "celebration" || type === "task_milestone" || type === "personal_best";
  }
  return true;
}

export function buildActivitySummary(items: ActivityFeedItem[]): ActivitySummary {
  let tasks = 0;
  let events = 0;

  for (const item of items) {
    if (item.type === "task_completed" || item.type === "task_assigned") tasks += 1;
    if (item.type === "calendar_event_added") events += 1;
  }

  return {
    updates: items.length,
    tasks,
    events,
  };
}

export function groupActivitiesByDate(items: ActivityFeedItem[]): ActivityDateSection[] {
  const buckets = new Map<ActivityDateGroup, ActivityFeedItem[]>();

  for (const item of items) {
    const existing = buckets.get(item.dateGroup) ?? [];
    existing.push(item);
    buckets.set(item.dateGroup, existing);
  }

  return DATE_GROUP_ORDER.filter((group) => (buckets.get(group)?.length ?? 0) > 0).map((group) => ({
    group,
    label: dateGroupLabel(group),
    items: buckets.get(group) ?? [],
  }));
}

function actorName(item: ActivityApiEvent): string {
  return item.user?.name ?? item.metadata?.userName ?? "Someone";
}

function mapTaskCompleted(item: ActivityApiEvent): Pick<ActivityFeedItem, "title" | "description" | "actionLabel" | "actionRoute"> {
  const name = actorName(item);
  const title = item.metadata?.taskTitle ?? "Task completed";
  const description = item.metadata?.taskTitle
    ? `${name} completed "${item.metadata.taskTitle}"`
    : `${name} completed a task`;

  return {
    title,
    description,
    actionLabel: "View Task",
    actionRoute: { pathname: "/(app)/execute" },
  };
}

function mapTaskAssigned(item: ActivityApiEvent): Pick<ActivityFeedItem, "title" | "description" | "actionLabel" | "actionRoute"> {
  const name = actorName(item);
  const count = item.metadata?.taskCount ?? 1;

  if (count > 1) {
    return {
      title: `${count} tasks assigned`,
      description: `${name} was assigned ${count} tasks`,
      actionLabel: "View Tasks",
      actionRoute: { pathname: "/(app)/execute" },
    };
  }

  const taskTitle = item.metadata?.taskTitles?.[0] ?? item.metadata?.taskTitle ?? "Task assigned";
  const description = item.metadata?.taskTitles?.[0] ?? item.metadata?.taskTitle
    ? `${name} was assigned "${taskTitle}"`
    : `${name} was assigned a task`;

  return {
    title: taskTitle,
    description,
    actionLabel: "View Task",
    actionRoute: { pathname: "/(app)/execute" },
  };
}

function mapCalendarEvent(item: ActivityApiEvent): Pick<ActivityFeedItem, "title" | "description" | "actionLabel" | "actionRoute"> {
  const name = actorName(item);
  const count = item.metadata?.eventCount ?? 1;

  if (count > 1) {
    return {
      title: `${count} events added`,
      description: `${name} added ${count} events to the calendar`,
      actionLabel: "View Calendar",
      actionRoute: { pathname: "/(app)/execute" },
    };
  }

  const eventTitle = item.metadata?.eventTitles?.[0] ?? item.metadata?.eventTitle ?? "New event";
  const description = item.metadata?.eventTitles?.[0] ?? item.metadata?.eventTitle
    ? `${name} added "${eventTitle}" to the calendar`
    : `${name} added an event to the calendar`;

  return {
    title: eventTitle,
    description,
    actionLabel: "View Calendar",
    actionRoute: { pathname: "/(app)/execute" },
  };
}

function mapMemberJoined(item: ActivityApiEvent): Pick<ActivityFeedItem, "title" | "description" | "actionLabel" | "actionRoute"> {
  const name = actorName(item);
  return {
    title: `${name} joined`,
    description: `${name} joined the team`,
    actionLabel: "Send Welcome",
    actionRoute: { pathname: "/(app)/team" },
  };
}

function mapMemberRemoved(item: ActivityApiEvent): Pick<ActivityFeedItem, "title" | "description" | "actionLabel" | "actionRoute"> {
  const name = actorName(item);
  return {
    title: `${name} left`,
    description: `${name} left the team`,
    actionLabel: "View Team",
    actionRoute: { pathname: "/(app)/team" },
  };
}

function mapTaskMilestone(item: ActivityApiEvent): Pick<ActivityFeedItem, "title" | "description" | "actionLabel" | "actionRoute"> {
  const name = actorName(item);
  const count = item.metadata?.count ?? 10;
  return {
    title: `${name} completed ${count} tasks this week!`,
    description: "Great work keeping the team moving forward.",
  };
}

function mapPersonalBest(item: ActivityApiEvent): Pick<ActivityFeedItem, "title" | "description" | "actionLabel" | "actionRoute"> {
  const name = actorName(item);
  const count = item.metadata?.count ?? 0;
  return {
    title: "Personal best",
    description: `${name} hit a new personal best of ${count} on-time tasks`,
  };
}

function mapCelebration(item: ActivityApiEvent): Pick<ActivityFeedItem, "title" | "description" | "actionLabel" | "actionRoute"> {
  const fromName = item.user?.name ?? "Someone";
  const toName = item.metadata?.targetName ?? "a teammate";
  return {
    title: toName,
    description: item.metadata?.message?.trim()
      ? `${fromName} recognized ${toName}: "${item.metadata.message.trim()}"`
      : `${fromName} recognized ${toName}`,
  };
}

export function mapApiActivityToFeedItem(event: ActivityApiEvent): ActivityFeedItem {
  const metadata = event.metadata ?? {};
  let mapped: Pick<ActivityFeedItem, "title" | "description" | "actionLabel" | "actionRoute">;

  switch (event.type) {
    case "task_completed":
      mapped = mapTaskCompleted(event);
      break;
    case "task_assigned":
      mapped = mapTaskAssigned(event);
      break;
    case "calendar_event_added":
      mapped = mapCalendarEvent(event);
      break;
    case "member_joined":
      mapped = mapMemberJoined(event);
      break;
    case "member_removed":
      mapped = mapMemberRemoved(event);
      break;
    case "task_milestone":
      mapped = mapTaskMilestone(event);
      break;
    case "personal_best":
      mapped = mapPersonalBest(event);
      break;
    case "celebration":
      mapped = mapCelebration(event);
      break;
    default:
      mapped = { title: "Activity update", description: "Something happened on your team" };
  }

  return {
    id: event.id,
    type: event.type,
    actor: event.user,
    title: mapped.title,
    description: mapped.description,
    timestamp: event.createdAt,
    dateGroup: getDateGroup(event.createdAt),
    metadata,
    actionLabel: mapped.actionLabel,
    actionRoute: mapped.actionRoute,
    reactions: event.reactions ?? {},
  };
}

export function mapApiActivitiesToFeedItems(events: ActivityApiEvent[]): ActivityFeedItem[] {
  return events.map(mapApiActivityToFeedItem);
}
