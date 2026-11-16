export type TaskStatus = "todo" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskKind = "workspace_task" | "reminder";
export type RecurrenceType = "daily" | "weekly" | "monthly" | "custom";
export type TeamRole = "owner" | "admin" | "member" | "team_leader";

export type MemberNextActionId =
  | "first_check_in"
  | "overdue_check_in"
  | "schedule_next_check_in"
  | "no_active_development_goals"
  | "development_goal_review_due"
  | "overdue_tasks"
  | "tasks_due_soon"
  | "everything_up_to_date";

export type MemberNextActionRoute =
  | "/(app)/execute"
  | "/plan-one-on-one"
  | "/person"
  | "/team-priority"
  | "/(app)/chat";

export type MemberNextAction = {
  id: MemberNextActionId;
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  title: string;
  copy: string;
  ctaLabel: string;
  affectedEntityIds: string[];
  generatedAt: string;
  cta: {
    route: MemberNextActionRoute;
    params: Record<string, string>;
  } | null;
};

export type MemberNextActionResponse = {
  data: MemberNextAction;
};

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  username?: string | null;
  profileTitle?: string | null;
  isWorkplaceConnected?: boolean;
  activeNow?: boolean;
  lastActiveAt?: string | null;
}

export interface Team {
  id: string;
  name: string;
  image?: string | null;
  location?: string | null;
  timezone?: string | null;
  inviteCode: string;
  role: TeamRole;
  createdAt: string;
  _count?: { members: number; tasks: number };
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  role: TeamRole;
  userId: string;
  teamId: string;
  joinedAt: string;
  user: User;
}

export interface RecurrenceRule {
  id: string;
  type: RecurrenceType;
  interval: number;
  daysOfWeek?: string | null;
  dayOfMonth?: number | null;
  nextDueAt?: string | null;
}

export interface SubtaskCompletion {
  id: string;
  subtaskId: string;
  userId: string;
  completedAt: string;
  user: { id: string; name: string; image?: string | null };
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  taskId: string;
  order: number;
  createdAt: string;
  completions?: SubtaskCompletion[];
}

export interface Task {
  id: string;
  /** Older cached task payloads may omit kind; treat those as workspace tasks. */
  kind?: TaskKind;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  attachmentUrl?: string | null;
  incognito?: boolean;
  createdAt: string;
  updatedAt: string;
  teamId: string;
  creatorId: string;
  creator: User;
  assignments: { id: string; userId: string; user: User }[];
  subtasks: Subtask[];
  recurrenceSeriesId?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  team?: { id: string; name: string };
  isJoint?: boolean;
}

export interface TaskNote {
  id: string;
  taskId: string;
  body: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: User;
}

export interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; name: string };
}

export interface Message {
  id: string;
  content?: string | null;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | null;
  replyToId?: string | null;
  replyTo?: {
    id: string;
    content?: string | null;
    mediaUrl?: string | null;
    mediaType?: string | null;
    sender: { id: string; name: string };
  } | null;
  reactions: MessageReaction[];
  createdAt: string;
  editedAt?: string | null;
  teamId: string;
  senderId: string;
  sender: User;
}

export interface DirectMessage {
  id: string;
  content?: string | null;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | null;
  replyToId?: string | null;
  replyTo?: {
    id: string;
    content?: string | null;
    mediaUrl?: string | null;
    mediaType?: string | null;
    sender: { id: string; name: string };
  } | null;
  reactions: MessageReaction[];
  createdAt: string;
  conversationId: string;
  senderId: string;
  sender: User;
  /** Client-only state for an outgoing message that has not reached the server. */
  deliveryStatus?: "sending" | "queued" | "failed";
}

/** One pinned message per Team Chat, Space, or DM conversation. */
export interface PinnedMessageSummary {
  messageId: string;
  content?: string | null;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | null;
  sender: { id: string; name: string | null; image?: string | null };
  pinnedAt: string;
  pinnedBy: { id: string; name: string | null };
}

export type GroupWorkspaceContext = {
  label: string;
  workspaces: Array<{ id: string; name: string }>;
  isCrossWorkspace: boolean;
};

export type ConnectionStatus =
  | "none"
  | "pending_outgoing"
  | "pending_incoming"
  | "connected"
  | "declined"
  | "blocked";

/** Shape of GET /api/users/search. Deliberately carries no email address. */
export type PersonSearchResult = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  isWorkplaceConnected?: boolean;
  sharedWorkspaceName: string | null;
  connectionStatus: ConnectionStatus;
  canMessage: boolean;
  messagePermissionReason:
    | "self"
    | "blocked"
    | "connected"
    | "shared_workspace"
    | "shared_group"
    | "open_inbox"
    | "not_connected";
  isBlockedByMe?: boolean;
  isBlockedByThem?: boolean;
  blockStatus?: "blocked_by_me" | "blocked_by_them" | "blocked_both" | null;
};

export type ConnectionPerson = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  profileTitle?: string | null;
  isWorkplaceConnected?: boolean;
};

export type ConnectionEntry = {
  id: string;
  person: ConnectionPerson;
  status: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
};

export type AcceptedConnectionEntry = ConnectionEntry & {
  activeNow: boolean;
  sharesWorkspace: boolean;
  sharedWorkspaceNames?: string[];
};

export type ConnectionsResponse = {
  accepted: AcceptedConnectionEntry[];
  incoming: ConnectionEntry[];
  outgoing: ConnectionEntry[];
};

export type ConnectionSuggestionReasonKey =
  | "current_workspace"
  | "mutual_connections"
  | "same_organization"
  | "shared_workspace"
  | "recently_joined_workspace";

export type ConnectionSuggestionWorkspace = {
  id: string;
  name: string;
  role: string;
  joinedAt: string;
};

export type ConnectionSuggestion = {
  person: ConnectionPerson;
  connectionStatus: "none" | "declined";
  sharedCurrentWorkspace: boolean;
  currentWorkspace?: ConnectionSuggestionWorkspace;
  sharedWorkspaces: ConnectionSuggestionWorkspace[];
  mutualConnections: number;
  mutualPreview?: ConnectionSuggestionMutual[];
  reasons: { key: ConnectionSuggestionReasonKey; label: string }[];
};

export type ConnectionSuggestionMutual = {
  id: string;
  name: string;
  image: string | null;
};

export type ConnectionSuggestionDismissalResponse = {
  userId: string;
  dismissedAt: string;
  dismissedUntil: string;
  cooldownDays: number;
};

export type ConnectionPairStatus = {
  status: ConnectionStatus;
  isBlockedByMe: boolean;
  isBlockedByThem: boolean;
  blockStatus: "blocked_by_me" | "blocked_by_them" | "blocked_both" | null;
  canMessage: boolean;
};

/** Authoritative result of POST /api/connections/request. */
export type ConnectionRequestResponse = Pick<ConnectionPairStatus, "status">;

export type PublicProfileWorkspace = {
  id: string;
  name: string;
  image: string | null;
  role: string;
  joinedAt: string;
};

export type PublicProfilePhoto = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

export type PublicPersonProfile = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  isWorkplaceConnected: boolean;
  emailVerified: boolean;
  memberSince: string;
  profileTitle: string | null;
  profileOrganization: string | null;
  profileWebsite: string | null;
  profileLocation: string | null;
  profileBio: string | null;
  profileHeaderImage: string | null;
  photos?: PublicProfilePhoto[];
  stats: {
    connections: number;
    workspaces: number;
    mutualConnections: number;
  };
  sharedWorkspaces: PublicProfileWorkspace[];
  connectionStatus: ConnectionStatus;
  isBlockedByMe: boolean;
  isBlockedByThem: boolean;
  blockStatus: "blocked_by_me" | "blocked_by_them" | "blocked_both" | null;
  canMessage: boolean;
  isSelf: boolean;
};

export type GroupMemberCandidate = {
  id: string;
  name: string | null;
  /** Null outside a shared workspace — see listPersonalGroupCandidates on the backend. */
  email: string | null;
  username: string | null;
  image: string | null;
  isWorkplaceConnected?: boolean;
  workspaces: Array<{ id: string; name: string }>;
  workspaceLabel: string;
};

export type GroupParticipantRole = "owner" | "admin" | "member";

export type ConversationParticipant = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  isWorkplaceConnected?: boolean;
  activeNow?: boolean;
  /** ISO timestamp when they share active status; null when hidden or unknown. */
  lastActiveAt?: string | null;
  role: GroupParticipantRole;
};

export interface Conversation {
  id: string;
  type?: "DIRECT" | "GROUP";
  isGroup: boolean;
  name?: string | null;
  image?: string | null;
  teamId?: string | null;
  workspaceId?: string | null;
  participants?: ConversationParticipant[];
  myRole?: GroupParticipantRole | null;
  workspaceContext?: GroupWorkspaceContext | null;
  messagingStatus?:
    | "available"
    | "blocked_by_me"
    | "connection_required"
    | "unavailable";
  createdAt: string;
  updatedAt: string;
  recipient: User | null;
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    sender: { id: string; name: string };
  } | null;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  teamId: string;
  createdById: string;
  createdAt: string;
  attachmentUrl?: string | null;
  subtasks?: { title: string; order: number }[];
  isRecurring?: boolean;
  recurrenceType?: RecurrenceType | null;
  recurrenceInterval?: number | null;
  recurrenceDaysOfWeek?: string | null;
  recurrenceDayOfMonth?: number | null;
  incognito?: boolean;
  isJoint?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  allDay: boolean;
  color: string;
  image?: string | null;
  teamId: string;
  createdAt: string;
  createdById?: string;
  createdBy?: { id: string; name: string; image?: string | null };
  isHidden?: boolean;
  isVideoMeeting?: boolean;
  isOneOnOne?: boolean;
  oneOnOneMemberUserId?: string | null;
  oneOnOneTemplateId?: string | null;
  /** Outlook / external busy block — read-only */
  isExternal?: boolean;
  approvalStatus?: "pending" | "approved" | "rejected";
  assigneeIds?: string[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeIds?: string[];
  recurrence?: {
    type: RecurrenceType;
    occurrenceCount: number;
    daysOfWeek?: string;
    dayOfMonth?: number;
  };
}

export type PersonalRecognition = {
  id: string;
  createdAt: string;
  canDelete?: boolean;
  deleteUntil?: string | null;
  celebrationType: string;
  message: string | null;
  workspace: { id: string; name: string } | null;
  giver: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  recipient?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  reactions?: Record<
    string,
    { count: number; userIds: string[]; users: { id: string; name: string }[] }
  > | null;
  commentCount?: number;
};

export type PersonalRecognitionsResponse = {
  total: number;
  items: PersonalRecognition[];
  givenTotal: number;
  givenItems: PersonalRecognition[];
};

export type HomeTodayItemType =
  | "task"
  | "reminder"
  | "event"
  | "meeting"
  | "check_in"
  | "holiday"
  | "external";

export type HomeTodayAssignee = {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
};

export type HomeTodayItem = {
  id: string;
  type: HomeTodayItemType;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  workspace: { id: string; name: string } | null;
  /** Tasks and reminders only, for the pill on the Home row. */
  priority?: TaskPriority;
  /** Finished today. Stays on Today, shown as already done. */
  done?: boolean;
  /** A task carried in from an earlier day, still unfinished. */
  overdue?: boolean;
  /** Present for tasks/reminders so preview sheets can render without a second fetch. */
  assignees?: HomeTodayAssignee[];
};

export type HomeUpcomingResponse = {
  timeZone: string;
  days: number;
  rangeStart: string;
  rangeEnd: string;
  items: HomeTodayItem[];
};

export type HomeTodayResponse = {
  date: string;
  timeZone: string;
  dateStart: string;
  dateEnd: string;
  items: HomeTodayItem[];
};

export type CreatePersonalRecognitionRequest = {
  targetUserId: string;
  celebrationType: string;
  message: string;
};

export type CreatePersonalRecognitionResponse = {
  id: string;
};

export type NetworkUpdateReactions = Record<
  string,
  {
    count: number;
    userIds: string[];
    users: Array<{ id: string; name: string }>;
  }
>;

export type NetworkUpdate = {
  id: string;
  teamId: null;
  type: "network_post";
  createdAt: string;
  metadata: {
    body: string | null;
    imageUrl: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
    mediaType?: "image" | "video" | null;
  } | null;
  user: { id: string; name: string; image: string | null } | null;
  reactions: NetworkUpdateReactions;
  commentCount: number;
  canDelete: boolean;
};

export type NetworkUpdateComment = {
  id: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  author: { id: string; name: string; image: string | null };
  canDelete: boolean;
  reactions: NetworkUpdateReactions;
};

export type NetworkUpdatesFeedResponse = {
  items: NetworkUpdate[];
  nextCursor: string | null;
};

export type NetworkUpdateResponse = NetworkUpdate;
export type NetworkUpdateCommentsResponse = NetworkUpdateComment[];

export type PersonalFeedSource = "network" | "workspace" | "alenio";

export type PersonalFeedItem = {
  id: string;
  source: PersonalFeedSource;
  sourceLabel: string;
  teamId: string | null;
  type: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  user: { id: string; name: string; image: string | null } | null;
  reactions: NetworkUpdateReactions;
  commentCount: number;
  commentsLocked: boolean;
  alenioAudience:
    | "all"
    | "workspace_members"
    | "non_workspace_members"
    | null;
  canDelete: boolean;
};

export type PersonalFeedResponse = {
  items: PersonalFeedItem[];
  nextCursor: string | null;
};
