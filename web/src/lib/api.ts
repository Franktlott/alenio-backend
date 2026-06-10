import { clearAccessToken, getAccessToken, refreshSessionTokens } from "./auth-client";
import { getWebApiBase } from "./api-base";

function apiBaseUrl(): string {
  return getWebApiBase();
}

function assertProductionApiConfigured(): void {
  if (import.meta.env.PROD && !apiBaseUrl().trim()) {
    throw new Error(
      "VITE_PROD_BACKEND_URL was not set when this app was built. Rebuild with your production API URL (e.g. Railway).",
    );
  }
}

function mapNetworkError(err: unknown): Error {
  if (err instanceof Error) {
    const m = err.message;
    if (
      err.name === "TypeError" ||
      m === "Load failed" ||
      m === "Failed to fetch" ||
      m.startsWith("NetworkError") ||
      m.includes("Network request failed")
    ) {
      return new Error(
        "Could not reach the API. Check your connection. If this is the hosted site, the API server must allow your domain (CORS) — deploy the latest backend or set CORS_ALLOWED_ORIGINS on Railway.",
      );
    }
    return err;
  }
  return new Error("Could not reach the API.");
}

async function readJson<T>(res: Response): Promise<T | null> {
  if (res.status === 204 || res.status === 205) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  assertProductionApiConfigured();
  const baseUrl = apiBaseUrl();
  const headers: HeadersInit = { ...(init?.headers as Record<string, string> | undefined) };
  const h = new Headers(headers);
  let token = getAccessToken();
  if (token) h.set("Authorization", `Bearer ${token}`);
  if (init?.body && !h.has("Content-Type")) {
    h.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, headers: h });
  } catch (e) {
    throw mapNetworkError(e);
  }

  if (res.status === 401) {
    const recovered = await refreshSessionTokens();
    if (recovered) {
      token = getAccessToken();
      const h2 = new Headers(init?.headers as HeadersInit);
      if (token) h2.set("Authorization", `Bearer ${token}`);
      if (init?.body && !h2.has("Content-Type")) {
        h2.set("Content-Type", "application/json");
      }
      try {
        res = await fetch(`${baseUrl}${path}`, { ...init, headers: h2 });
      } catch (e) {
        throw mapNetworkError(e);
      }
    } else {
      clearAccessToken();
    }
  }

  if (!res.ok) {
    const body = await readJson<{ error?: string | { message?: string }; message?: string }>(res);
    const msg =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.error === "object" && body?.error?.message
          ? body.error.message
          : typeof body?.message === "string"
            ? body.message
            : res.status === 404
              ? "Not found — this may not exist or you may not have access."
              : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  const parsed = await readJson<T>(res);
  return (parsed ?? {}) as T;
}

export async function apiGetJson<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function apiPatchJson<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiDeleteJson<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}

export type WebMeUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
};

export type WebTeamRow = {
  id: string;
  name: string;
  image?: string | null;
  createdAt: string;
  role: string;
  inviteCode?: string | null;
  _count: { members: number; tasks: number };
  /** Team plan (tasks, activity, execute) — from GET /web/api/teams; absent on older clients means unknown. */
  hasTeamFeatures?: boolean;
};

export type WebTeamSubscription = {
  id: string;
  teamId: string;
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
  billingProvider?: "stripe" | "mobile_store" | "none";
};

export type TeamChatMessage = {
  id: string;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  senderId: string;
  teamId: string;
  sender: { id: string; name: string | null; email: string | null; image: string | null };
};

export type TeamTopic = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  teamId: string;
  _count?: { messages: number };
};

export type DmConversation = {
  id: string;
  isGroup: boolean;
  name: string | null;
  participants: Array<{ id: string; name: string | null; email: string | null; image: string | null }>;
  recipient: { id: string; name: string | null; email: string | null; image: string | null } | null;
  lastMessage: {
    id: string;
    content: string | null;
    createdAt: string;
    sender?: { id: string; name: string | null };
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type DirectChatMessage = {
  id: string;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  senderId: string;
  conversationId: string;
  sender: { id: string; name: string | null; email: string | null; image: string | null };
};

export function fetchWebMe() {
  return apiGetJson<{ data: WebMeUser | null }>("/web/api/me").then((r) => r.data);
}

export function patchApiProfile(body: { name?: string; image?: string | null }) {
  return apiPatchJson<{ data: { id: string; name: string | null; email: string | null; image: string | null } }>(
    "/api/profile",
    body,
  ).then((r) => r.data);
}

/** Permanently delete the signed-in user and all associated app data (password required). */
export function deleteApiAccount(password: string) {
  return apiRequest<{ data: { deleted: boolean } }>("/api/user", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

export async function fetchWebTeams() {
  const [webRes, mobileRes] = await Promise.all([
    apiGetJson<{ data: WebTeamRow[] }>("/web/api/teams"),
    apiGetJson<{ data: Array<{ id: string; image?: string | null }> }>("/api/teams").catch(() => null),
  ]);
  const mobileImageById = new Map((mobileRes?.data ?? []).map((t) => [t.id, t.image]));
  return webRes.data.map((t) => ({
    ...t,
    image: t.image || mobileImageById.get(t.id) || null,
  }));
}

export type WebTeamJoinRequest = {
  id: string;
  teamId: string;
  userId: string;
  status: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null; image: string | null };
};

export function fetchTeamJoinRequests(teamId: string) {
  return apiGetJson<{ data: WebTeamJoinRequest[] }>(
    `/api/teams/${encodeURIComponent(teamId)}/join-requests`,
  ).then((r) => r.data);
}

export function approveTeamJoinRequest(teamId: string, requestId: string) {
  return apiPostJson<{ data: { success: boolean } }>(
    `/api/teams/${encodeURIComponent(teamId)}/join-requests/${encodeURIComponent(requestId)}/approve`,
    {},
  );
}

export function rejectTeamJoinRequest(teamId: string, requestId: string) {
  return apiPostJson<{ data: { success: boolean } }>(
    `/api/teams/${encodeURIComponent(teamId)}/join-requests/${encodeURIComponent(requestId)}/reject`,
    {},
  );
}

export async function fetchWebTeamSubscription(teamId: string): Promise<WebTeamSubscription> {
  const q = encodeURIComponent(teamId);
  try {
    return await apiGetJson<{ data: WebTeamSubscription }>(`/web/api/teams/${q}/subscription`).then((r) => r.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Not found")) {
      return apiGetJson<{ data: WebTeamSubscription }>(`/api/teams/${q}/subscription`).then((r) => r.data);
    }
    throw e;
  }
}

export function postWebBillingCheckout(teamId: string) {
  return apiPostJson<{ data: { url: string } }>("/web/api/billing/checkout-session", { teamId }).then((r) => r.data);
}

export function postWebBillingPortal(teamId: string) {
  return apiPostJson<{ data: { url: string } }>("/web/api/billing/portal-session", { teamId }).then((r) => r.data);
}

export type WebBillingReconcileResult = {
  subscription: WebTeamSubscription & { billingProvider: "stripe" | "mobile_store" | "none" };
  reconcile: { applied: boolean; message: string };
};

export function postWebBillingReconcile(teamId: string) {
  return apiPostJson<{ data: WebBillingReconcileResult }>("/web/api/billing/reconcile-subscription", { teamId }).then(
    (r) => r.data,
  );
}

export function fetchWebCheckoutConfig() {
  return apiGetJson<{ data: { configured: boolean; missingKeys: string[] } }>("/web/api/billing/checkout-config").then(
    (r) => r.data,
  );
}

export function fetchTeamMessages(teamId: string, topicId: string) {
  const q = new URLSearchParams({ topicId, limit: "100" });
  return apiGetJson<{ data: TeamChatMessage[] }>(
    `/api/teams/${encodeURIComponent(teamId)}/messages?${q.toString()}`,
  ).then((r) => r.data);
}

export function postTeamMessage(
  teamId: string,
  content: string,
  topicId: string,
  media?: { mediaUrl: string; mediaType: string },
) {
  return apiPostJson<{ data: TeamChatMessage }>(`/api/teams/${encodeURIComponent(teamId)}/messages`, {
    content: content.trim() || null,
    topicId: topicId === "general" ? null : topicId,
    ...(media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
  }).then((r) => r.data);
}

export function fetchTeamTopics(teamId: string) {
  return apiGetJson<{ data: TeamTopic[] }>(`/api/teams/${encodeURIComponent(teamId)}/topics`).then((r) => r.data);
}

export function fetchDmConversations() {
  return apiGetJson<{ data: DmConversation[] }>("/api/dms").then((r) => r.data);
}

export function fetchDmMessages(conversationId: string) {
  return apiGetJson<{ data: DirectChatMessage[] }>(`/api/dms/${encodeURIComponent(conversationId)}/messages`).then((r) => r.data);
}

export function postDmMessage(
  conversationId: string,
  content: string,
  media?: { mediaUrl: string; mediaType: string },
) {
  return apiPostJson<{ data: DirectChatMessage }>(`/api/dms/${encodeURIComponent(conversationId)}/messages`, {
    content: content.trim() || null,
    ...(media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
  }).then((r) => r.data);
}

export type ChatUploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
};

/** Same as mobile `POST /api/upload` — Firebase Storage when configured. */
export async function uploadChatMedia(file: File): Promise<ChatUploadResult> {
  assertProductionApiConfigured();
  const baseUrl = apiBaseUrl();
  async function doUpload(token: string | null) {
    const formData = new FormData();
    formData.append("file", file);
    const h = new Headers();
    if (token) h.set("Authorization", `Bearer ${token}`);
    try {
      return await fetch(`${baseUrl}/api/upload`, { method: "POST", body: formData, headers: h });
    } catch (e) {
      throw mapNetworkError(e);
    }
  }

  let token = getAccessToken();
  let res = await doUpload(token);

  if (res.status === 401) {
    const recovered = await refreshSessionTokens();
    if (recovered) {
      token = getAccessToken();
      res = await doUpload(token);
    } else {
      clearAccessToken();
    }
  }

  const parsed = (await res.json().catch(() => ({}))) as {
    data?: ChatUploadResult;
    error?: string | { message?: string };
    message?: string;
  };

  if (!res.ok) {
    const msg =
      typeof parsed?.error === "string"
        ? parsed.error
        : typeof parsed?.error === "object" && parsed?.error?.message
          ? parsed.error.message
          : typeof parsed?.message === "string"
            ? parsed.message
            : res.status === 503
              ? "File storage is not configured on the server."
              : `Upload failed (${res.status})`;
    throw new Error(msg);
  }

  if (!parsed.data) throw new Error("Upload response missing data.");
  return parsed.data;
}

export type ApiTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  completedAt: string | null;
  teamId?: string;
  creatorId?: string;
  attachmentUrl?: string | null;
  incognito?: boolean;
  isJoint?: boolean;
  createdAt?: string;
  updatedAt?: string;
  creator?: { id: string; name: string | null; email?: string | null; image?: string | null };
  subtasks?: ApiSubtask[];
  assignments: Array<{
    user: { id: string; name: string | null; email?: string | null; image: string | null };
  }>;
};

export type ApiSubtask = {
  id: string;
  title: string;
  completed: boolean;
  order: number;
};

export type ApiTaskDetail = ApiTask & {
  teamId: string;
  creatorId: string;
  attachmentUrl: string | null;
  incognito: boolean;
  isJoint: boolean;
  createdAt: string;
  updatedAt: string;
  team: { id: string; name: string };
  creator: { id: string; name: string | null; email: string | null; image: string | null };
  subtasks: ApiSubtask[];
};

export function fetchWebTaskDetail(taskId: string, teamId?: string | null) {
  const tid = encodeURIComponent(taskId);
  const ws = teamId?.trim();
  if (!ws) {
    return apiGetJson<{ data: ApiTaskDetail }>(`/web/api/tasks/${tid}`).then((r) => r.data);
  }
  return apiGetJson<{ data: ApiTaskDetail }>(`/web/api/teams/${encodeURIComponent(ws)}/tasks/${tid}`)
    .then((r) => r.data)
    .catch(() => apiGetJson<{ data: ApiTaskDetail }>(`/web/api/tasks/${tid}`).then((r) => r.data));
}

export type ApiCalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string | null;
  allDay: boolean | null;
  color?: string | null;
  isHidden?: boolean | null;
  isVideoMeeting?: boolean | null;
  createdById?: string;
};

export type ActivityMetadata = {
  taskTitle?: string;
  taskTitles?: string[];
  taskCount?: number;
  eventTitle?: string;
  eventTitles?: string[];
  eventCount?: number;
  startDate?: string;
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
} | null;

export type ActivityReactionBucket = {
  count: number;
  userIds: string[];
  users: { id: string; name: string | null }[];
};

export type ApiActivityItem = {
  id: string;
  type: string;
  createdAt: string;
  metadata: ActivityMetadata;
  user: { id: string; name: string | null; image: string | null } | null;
  reactions: Record<string, ActivityReactionBucket>;
};

export type UpcomingVideoMeeting = {
  event: ApiCalendarEvent & { teamId: string };
  teamName: string;
  userRole: string;
};

/** Web dashboard routes (`/web/...`) — no mobile subscription gate on tasks. */
export function fetchWebTeamTasks(teamId: string) {
  return apiGetJson<{ data: ApiTask[] }>(`/web/api/teams/${encodeURIComponent(teamId)}/tasks`).then((r) => r.data);
}

// Core app route fallback (often deployed earlier than /web routes)
export function fetchCoreTeamTasks(teamId: string) {
  return apiGetJson<{ data: ApiTask[] | { tasks?: ApiTask[] } }>(`/api/teams/${encodeURIComponent(teamId)}/tasks`).then(
    (r) => {
      const data = r.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.tasks)) return data.tasks;
      return [];
    },
  );
}

export function updateCoreTeamTask(
  teamId: string,
  taskId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    priority: string;
    dueDate: string | null;
    status: string;
    attachmentUrl: string | null;
  }>,
) {
  return apiPatchJson<{ data: ApiTask }>(`/api/teams/${encodeURIComponent(teamId)}/tasks/${encodeURIComponent(taskId)}`, patch).then(
    (r) => r.data,
  );
}

export function fetchWebTeamEvents(teamId: string) {
  return apiGetJson<{ data: ApiCalendarEvent[] }>(
    `/web/api/teams/${encodeURIComponent(teamId)}/events`,
  ).then((r) => r.data);
}

export function createWebTeamEvent(
  teamId: string,
  input: {
    title: string;
    description?: string | null;
    startDate: string;
    endDate?: string | null;
    allDay?: boolean;
    color?: string;
    isVideoMeeting?: boolean;
    isHidden?: boolean;
    assigneeIds?: string[];
    reminderMinutes?: number[];
  },
) {
  return apiPostJson<{ data: ApiCalendarEvent }>(`/web/api/teams/${encodeURIComponent(teamId)}/events`, {
    title: input.title,
    description: input.description ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    allDay: input.allDay ?? true,
    color: input.color ?? "#4361EE",
    isVideoMeeting: input.isVideoMeeting ?? false,
    isHidden: input.isHidden ?? false,
    assigneeIds: input.assigneeIds,
    reminderMinutes: input.reminderMinutes,
  }).then((r) => r.data);
}

export function deleteWebTeamEvent(teamId: string, eventId: string) {
  return apiRequest<{ data: { ok: true } }>(
    `/web/api/teams/${encodeURIComponent(teamId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  ).then((r) => r.data);
}

export async function deleteWebTask(taskId: string, teamId?: string) {
  const tid = encodeURIComponent(taskId);
  try {
    return await apiRequest<{ data: { ok: true } }>(`/web/api/tasks/${tid}`, { method: "DELETE" }).then((r) => r.data);
  } catch (e) {
    if (!teamId) throw e;
    await apiRequest<unknown>(`/api/teams/${encodeURIComponent(teamId)}/tasks/${tid}`, { method: "DELETE" });
    return { ok: true as const };
  }
}

export function updateWebTeamEvent(
  teamId: string,
  eventId: string,
  input: {
    title?: string;
    description?: string | null;
    startDate?: string;
    endDate?: string | null;
    allDay?: boolean;
    color?: string;
    isVideoMeeting?: boolean;
    isHidden?: boolean;
    assigneeIds?: string[];
    reminderMinutes?: number[];
  },
) {
  return apiPatchJson<{ data: ApiCalendarEvent }>(`/web/api/teams/${encodeURIComponent(teamId)}/events/${encodeURIComponent(eventId)}`, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.isVideoMeeting !== undefined ? { isVideoMeeting: input.isVideoMeeting } : {}),
    ...(input.isHidden !== undefined ? { isHidden: input.isHidden } : {}),
    ...(input.assigneeIds !== undefined ? { assigneeIds: input.assigneeIds } : {}),
    ...(input.reminderMinutes !== undefined ? { reminderMinutes: input.reminderMinutes } : {}),
  }).then((r) => r.data);
}

export function fetchTeamActivity(teamId: string) {
  return apiGetJson<{ data: ApiActivityItem[] }>(
    `/api/teams/${encodeURIComponent(teamId)}/activity`,
  ).then((r) => r.data);
}

export function postActivityReaction(teamId: string, activityId: string, emoji: string) {
  return apiPostJson<{ data: { toggled: boolean } }>(
    `/api/teams/${encodeURIComponent(teamId)}/activity/${encodeURIComponent(activityId)}/react`,
    { emoji },
  ).then((r) => r.data);
}

export function postActivityCelebrate(
  teamId: string,
  payload: { targetUserId: string; celebrationType: string; message?: string },
) {
  return apiPostJson<{ data: { id: string } }>(`/api/teams/${encodeURIComponent(teamId)}/activity/celebrate`, payload).then((r) => r.data);
}

export function fetchUpcomingVideoMeetings() {
  return apiGetJson<{ data: UpcomingVideoMeeting[] }>("/api/video/upcoming").then((r) => r.data);
}

export function createVideoRoom(roomId: string, userName?: string | null) {
  return apiPostJson<{ data: { url: string; token: string | null } }>("/api/video/room", {
    roomId,
    userName: userName ?? undefined,
  }).then((r) => r.data);
}

export type ApiPollOption = {
  id: string;
  text: string;
  votes: { userId: string }[];
};

export type ApiPoll = {
  id: string;
  teamId: string;
  topicId: string | null;
  question: string;
  endsAt: string;
  createdById: string;
  allowLeaderDelete: boolean;
  createdBy: { id: string; name: string | null; image: string | null };
  options: ApiPollOption[];
  votes: { userId: string; optionId: string }[];
};

/** topicKey `"general"` lists polls for the main team channel (no topic). */
export function fetchTeamPolls(teamId: string, topicKey: string) {
  const qs = topicKey === "general" ? "" : `?topicId=${encodeURIComponent(topicKey)}`;
  return apiGetJson<{ data: ApiPoll[] }>(`/api/teams/${encodeURIComponent(teamId)}/polls${qs}`).then((r) => r.data);
}

export function createTeamPoll(
  teamId: string,
  input: {
    question: string;
    options: string[];
    durationHours: number;
    allowLeaderDelete?: boolean;
    topicId?: string | null;
  },
) {
  return apiPostJson<{ data: ApiPoll }>(`/api/teams/${encodeURIComponent(teamId)}/polls`, {
    question: input.question,
    options: input.options,
    durationHours: input.durationHours,
    allowLeaderDelete: input.allowLeaderDelete ?? true,
    topicId: input.topicId ?? null,
  }).then((r) => r.data);
}

export function voteTeamPoll(teamId: string, pollId: string, optionId: string) {
  return apiPostJson<{ data: ApiPoll }>(
    `/api/teams/${encodeURIComponent(teamId)}/polls/${encodeURIComponent(pollId)}/vote`,
    { optionId },
  ).then((r) => r.data);
}

export type WebTeamMemberRow = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string | null; email: string | null; image: string | null };
};

export type WebTeamDetail = {
  id: string;
  name: string;
  image?: string | null;
  createdAt: string;
  inviteCode?: string | null;
  _count?: { members: number; tasks: number };
  members: WebTeamMemberRow[];
  myRole: string;
};

export type MyJoinRequestRow = {
  id: string;
  teamId: string;
  userId: string;
  status: string;
  createdAt: string;
  team: { id: string; name: string; image: string | null };
};

export function fetchMyJoinRequests() {
  return apiGetJson<{ data: MyJoinRequestRow[] }>("/api/join-requests/mine").then((r) => r.data);
}

export function cancelMyJoinRequest(requestId: string) {
  return apiRequest<unknown>(`/api/join-requests/${encodeURIComponent(requestId)}`, { method: "DELETE" });
}

/** Join-by-code: either a pending approval request or immediate membership (team row). */
export type JoinByCodeResult =
  | { status: "pending"; teamName: string; requestId: string }
  | (WebTeamRow & { role?: string });

export function postJoinTeamByCode(inviteCode: string) {
  return apiPostJson<{ data: JoinByCodeResult }>("/api/teams/join", {
    inviteCode: inviteCode.trim(),
  }).then((r) => r.data);
}

export function createWebTeam(name: string) {
  return apiPostJson<{ data: WebTeamRow }>("/web/api/teams", { name: name.trim() }).then((r) => r.data);
}

export function patchApiTeam(teamId: string, body: { name?: string; image?: string | null }) {
  return apiPatchJson<{ data: { id: string; name: string; image?: string | null } }>(
    `/api/teams/${encodeURIComponent(teamId)}`,
    body,
  ).then((r) => r.data);
}

export type TeamMemberStatsMap = Record<
  string,
  { activeTasks: number; overdueTasks: number; completedTasks: number; streak: number; personalBestStreak: number }
>;

export function fetchTeamMemberStats(teamId: string) {
  return apiGetJson<{ data: TeamMemberStatsMap }>(
    `/api/teams/${encodeURIComponent(teamId)}/tasks/member-stats`,
  ).then((r) => r.data);
}

export type MonthlyCompletionRow = {
  label: string;
  year: number;
  month: number;
  completionPct: number | null;
  done: number;
  total: number;
};

export function fetchTeamMonthlyCompletion(teamId: string) {
  return apiGetJson<{ data: MonthlyCompletionRow[] }>(
    `/api/teams/${encodeURIComponent(teamId)}/tasks/monthly-completion`,
  ).then((r) => r.data);
}

export function removeTeamMemberApi(teamId: string, userId: string) {
  return apiRequest<unknown>(
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export function setTeamMemberRole(teamId: string, userId: string, role: "member" | "team_leader") {
  return apiPatchJson<{ data: unknown }>(
    `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/role`,
    { role },
  );
}

export function transferTeamOwnership(teamId: string, userId: string) {
  return apiPostJson<{ data: { success: boolean } }>(
    `/api/teams/${encodeURIComponent(teamId)}/transfer-ownership`,
    { userId },
  );
}

export function leaveTeam(teamId: string) {
  return apiRequest<unknown>(`/api/teams/${encodeURIComponent(teamId)}/leave`, { method: "DELETE" });
}

export type DeleteTeamConfirmation = {
  password?: string;
  confirmPhrase?: string;
};

/** Permanently delete a workspace (owner only). Confirm with password or confirmPhrase "DELETE". */
export function deleteTeam(teamId: string, confirmation: DeleteTeamConfirmation) {
  return apiRequest<unknown>(`/api/teams/${encodeURIComponent(teamId)}`, {
    method: "DELETE",
    body: JSON.stringify(confirmation),
  });
}

/** Team photo: same upload endpoint as chat; requires purpose=team and teamId. */
export async function uploadTeamPhoto(file: File, teamId: string): Promise<ChatUploadResult> {
  assertProductionApiConfigured();
  const baseUrl = apiBaseUrl();
  async function doUpload(token: string | null) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("purpose", "team");
    formData.append("teamId", teamId);
    const h = new Headers();
    if (token) h.set("Authorization", `Bearer ${token}`);
    try {
      return await fetch(`${baseUrl}/api/upload`, { method: "POST", body: formData, headers: h });
    } catch (e) {
      throw mapNetworkError(e);
    }
  }
  let token = getAccessToken();
  let res = await doUpload(token);
  if (res.status === 401) {
    const recovered = await refreshSessionTokens();
    if (recovered) {
      token = getAccessToken();
      res = await doUpload(token);
    } else {
      clearAccessToken();
    }
  }
  const parsed = (await res.json().catch(() => ({}))) as {
    data?: ChatUploadResult;
    error?: string | { message?: string };
    message?: string;
  };
  if (!res.ok) {
    const msg =
      typeof parsed?.error === "string"
        ? parsed.error
        : typeof parsed?.error === "object" && parsed?.error?.message
          ? parsed.error.message
          : typeof parsed?.message === "string"
            ? parsed.message
            : `Upload failed (${res.status})`;
    throw new Error(msg);
  }
  if (!parsed.data) throw new Error("Upload response missing data.");
  return parsed.data;
}

/** Profile avatar: same upload endpoint as chat; use purpose=profile (no teamId). */
export async function uploadProfilePhoto(file: File): Promise<ChatUploadResult> {
  assertProductionApiConfigured();
  const baseUrl = apiBaseUrl();
  async function doUpload(token: string | null) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("purpose", "profile");
    const h = new Headers();
    if (token) h.set("Authorization", `Bearer ${token}`);
    try {
      return await fetch(`${baseUrl}/api/upload`, { method: "POST", body: formData, headers: h });
    } catch (e) {
      throw mapNetworkError(e);
    }
  }
  let token = getAccessToken();
  let res = await doUpload(token);
  if (res.status === 401) {
    const recovered = await refreshSessionTokens();
    if (recovered) {
      token = getAccessToken();
      res = await doUpload(token);
    } else {
      clearAccessToken();
    }
  }
  const parsed = (await res.json().catch(() => ({}))) as {
    data?: ChatUploadResult;
    error?: string | { message?: string };
    message?: string;
  };
  if (!res.ok) {
    const msg =
      typeof parsed?.error === "string"
        ? parsed.error
        : typeof parsed?.error === "object" && parsed?.error?.message
          ? parsed.error.message
          : typeof parsed?.message === "string"
            ? parsed.message
            : `Upload failed (${res.status})`;
    throw new Error(msg);
  }
  if (!parsed.data) throw new Error("Upload response missing data.");
  return parsed.data;
}

export function fetchWebTeam(teamId: string) {
  return apiGetJson<{ data: WebTeamDetail }>(`/web/api/teams/${encodeURIComponent(teamId)}`).then((r) => r.data);
}

export type CreateWebTaskInput = {
  teamId: string;
  title: string;
  description?: string | null;
  priority?: string;
  status?: string;
  dueDate?: string | null;
  assigneeIds: string[];
  isJoint?: boolean;
  incognito?: boolean;
  subtasks?: string[];
};

export function createWebTask(input: CreateWebTaskInput) {
  return apiPostJson<{ data: { tasks: ApiTask[] } }>("/web/api/tasks", {
    teamId: input.teamId,
    title: input.title,
    description: input.description || undefined,
    priority: input.priority ?? "medium",
    status: input.status ?? "todo",
    dueDate: input.dueDate || undefined,
    assigneeIds: input.assigneeIds,
    isJoint: input.isJoint === true,
    incognito: input.incognito === true,
    subtasks: input.subtasks?.filter((t) => t.trim()).length ? input.subtasks.filter((t) => t.trim()) : undefined,
  }).then((r) => r.data.tasks);
}

export type OneOnOneTemplateFieldType =
  | "section"
  | "short_text"
  | "long_text"
  | "rating"
  | "manager_notes"
  | "associate_notes";

export type AssociateRequestMode = "task" | "message";

export type OneOnOneTemplateField = {
  id: string;
  label: string;
  type: OneOnOneTemplateFieldType;
  order: number;
  required?: boolean;
  ratingMax?: number;
  helpText?: string | null;
  associateRequest?: AssociateRequestMode | null;
};

export type OneOnOneAssociateFeedbackContext = {
  fieldId: string;
  fieldLabel: string;
  helpText: string | null;
  meetingTitle: string;
  currentResponse: string;
  submitted: boolean;
  associateRequest: AssociateRequestMode | null;
};

export type OneOnOneTemplate = {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  fields: OneOnOneTemplateField[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string; email: string; image: string | null };
};

export type OneOnOneTemplateInput = {
  title: string;
  description?: string | null;
  fields: OneOnOneTemplateField[];
};

function requireTeamId(teamId: string): string {
  const id = teamId?.trim();
  if (!id) throw new Error("No workspace selected.");
  return id;
}

function oneOnOneTemplatesPaths(teamId: string) {
  const id = encodeURIComponent(requireTeamId(teamId));
  return {
    api: `/api/teams/${id}/one-on-one-templates`,
    web: `/web/api/teams/${id}/one-on-one-templates`,
  };
}

function oneOnOneMeetingsPaths(teamId: string, memberUserId: string) {
  const team = encodeURIComponent(requireTeamId(teamId));
  const member = encodeURIComponent(requireTeamId(memberUserId));
  return {
    api: `/api/teams/${team}/members/${member}/one-on-ones`,
    web: `/web/api/teams/${team}/members/${member}/one-on-ones`,
  };
}

async function oneOnOneRequest<T>(paths: { api: string; web: string }, init?: RequestInit): Promise<T> {
  try {
    return await apiRequest<T>(paths.api, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Not found")) {
      return apiRequest<T>(paths.web, init);
    }
    throw e;
  }
}

export function fetchOneOnOneTemplates(teamId: string) {
  const paths = oneOnOneTemplatesPaths(teamId);
  return oneOnOneRequest<{ data: OneOnOneTemplate[] }>(paths).then((r) => r.data ?? []);
}

export function createOneOnOneTemplate(teamId: string, input: OneOnOneTemplateInput) {
  const paths = oneOnOneTemplatesPaths(teamId);
  return oneOnOneRequest<{ data: OneOnOneTemplate }>(paths, {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => r.data);
}

export function updateOneOnOneTemplate(teamId: string, templateId: string, input: OneOnOneTemplateInput) {
  const paths = oneOnOneTemplatesPaths(teamId);
  const suffix = `/${encodeURIComponent(templateId)}`;
  return oneOnOneRequest<{ data: OneOnOneTemplate }>(
    { api: `${paths.api}${suffix}`, web: `${paths.web}${suffix}` },
    { method: "PATCH", body: JSON.stringify(input) },
  ).then((r) => r.data);
}

export function deleteOneOnOneTemplate(teamId: string, templateId: string) {
  const paths = oneOnOneTemplatesPaths(teamId);
  const suffix = `/${encodeURIComponent(templateId)}`;
  return oneOnOneRequest<{ data: { deleted: boolean } }>(
    { api: `${paths.api}${suffix}`, web: `${paths.web}${suffix}` },
    { method: "DELETE" },
  );
}

export type OneOnOneFollowUpTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  assignee: { id: string; name: string | null; email: string; image: string | null } | null;
};

export type OneOnOneFollowUpTaskInput = {
  title: string;
  assigneeUserId: string;
  description?: string;
  dueDate?: string;
};

export type OneOnOneMeeting = {
  id: string;
  teamId: string;
  memberUserId: string;
  templateId: string | null;
  templateTitle: string;
  templateFields: OneOnOneTemplateField[];
  responses: Record<string, string | number>;
  createdById: string;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string; image: string | null };
  followUpTasks?: OneOnOneFollowUpTask[];
  associateFeedbackPending?: boolean;
};

export function fetchOneOnOneMeetings(teamId: string, memberUserId: string) {
  const paths = oneOnOneMeetingsPaths(teamId, memberUserId);
  return oneOnOneRequest<{ data: OneOnOneMeeting[] }>(paths).then((r) => r.data ?? []);
}

export function createOneOnOneMeeting(
  teamId: string,
  memberUserId: string,
  input: {
    templateId: string;
    responses: Record<string, string | number>;
    followUpTasks?: OneOnOneFollowUpTaskInput[];
    requestAssociateFeedback?: boolean;
  },
) {
  const paths = oneOnOneMeetingsPaths(teamId, memberUserId);
  return oneOnOneRequest<{ data: OneOnOneMeeting }>(paths, {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => r.data);
}

function oneOnOneMeetingPaths(teamId: string, memberUserId: string, meetingId: string) {
  const team = encodeURIComponent(requireTeamId(teamId));
  const member = encodeURIComponent(requireTeamId(memberUserId));
  const meeting = encodeURIComponent(meetingId);
  const suffix = `/one-on-ones/${meeting}`;
  return {
    api: `/api/teams/${team}/members/${member}${suffix}`,
    web: `/web/api/teams/${team}/members/${member}${suffix}`,
  };
}

export function updateOneOnOneMeeting(
  teamId: string,
  memberUserId: string,
  meetingId: string,
  input: {
    responses: Record<string, string | number>;
    followUpTasks?: OneOnOneFollowUpTaskInput[];
    requestAssociateFeedback?: boolean;
  },
) {
  const paths = oneOnOneMeetingPaths(teamId, memberUserId, meetingId);
  return oneOnOneRequest<{ data: OneOnOneMeeting }>(paths, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((r) => r.data);
}

export function deleteOneOnOneMeeting(teamId: string, memberUserId: string, meetingId: string) {
  const paths = oneOnOneMeetingPaths(teamId, memberUserId, meetingId);
  return oneOnOneRequest<{ data: { deleted: boolean } }>(paths, { method: "DELETE" });
}

function oneOnOneAssociateFeedbackPaths(teamId: string, memberUserId: string, meetingId: string, fieldId?: string) {
  const base = oneOnOneMeetingPaths(teamId, memberUserId, meetingId);
  const suffix = fieldId ? `/associate-feedback/${encodeURIComponent(fieldId)}` : "/associate-feedback";
  return {
    api: `${base.api}${suffix}`,
    web: `${base.web}${suffix}`,
  };
}

export function fetchOneOnOneAssociateFeedbackContext(
  teamId: string,
  memberUserId: string,
  meetingId: string,
  fieldId: string,
) {
  const paths = oneOnOneAssociateFeedbackPaths(teamId, memberUserId, meetingId, fieldId);
  return oneOnOneRequest<{ data: OneOnOneAssociateFeedbackContext }>(paths).then((r) => r.data);
}

export function submitOneOnOneAssociateFeedback(
  teamId: string,
  memberUserId: string,
  meetingId: string,
  input: { fieldId: string; response: string },
) {
  const paths = oneOnOneAssociateFeedbackPaths(teamId, memberUserId, meetingId);
  return oneOnOneRequest<{ data: OneOnOneMeeting }>(paths, {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => r.data);
}

export type DevelopmentGoalNote = {
  id: string;
  body: string;
  createdAt: string;
  createdById: string;
  createdBy: { id: string; name: string; email: string; image: string | null };
};

export type DevelopmentGoal = {
  id: string;
  teamId: string;
  memberUserId: string;
  skill: string;
  steps: string[];
  createdById: string;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string; image: string | null };
  notes: DevelopmentGoalNote[];
};

function developmentGoalsPaths(teamId: string, memberUserId: string, goalId?: string) {
  const team = encodeURIComponent(requireTeamId(teamId));
  const member = encodeURIComponent(requireTeamId(memberUserId));
  const base = `/api/teams/${team}/members/${member}/development-goals`;
  const webBase = `/web/api/teams/${team}/members/${member}/development-goals`;
  if (!goalId) return { api: base, web: webBase };
  const suffix = `/${encodeURIComponent(goalId)}`;
  return { api: `${base}${suffix}`, web: `${webBase}${suffix}` };
}

async function developmentGoalsRequest<T>(paths: { api: string; web: string }, init?: RequestInit): Promise<T> {
  try {
    return await apiRequest<T>(paths.api, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Not found")) {
      return apiRequest<T>(paths.web, init);
    }
    throw e;
  }
}

export function fetchDevelopmentGoals(teamId: string, memberUserId: string) {
  const paths = developmentGoalsPaths(teamId, memberUserId);
  return developmentGoalsRequest<{ data: DevelopmentGoal[] }>(paths).then((r) => r.data ?? []);
}

export function createDevelopmentGoal(
  teamId: string,
  memberUserId: string,
  input: { skill: string; steps: string[] },
) {
  const paths = developmentGoalsPaths(teamId, memberUserId);
  return developmentGoalsRequest<{ data: DevelopmentGoal }>(paths, {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => r.data);
}

export function addDevelopmentGoalNote(
  teamId: string,
  memberUserId: string,
  goalId: string,
  body: string,
) {
  const paths = developmentGoalsPaths(teamId, memberUserId, goalId);
  return developmentGoalsRequest<{ data: DevelopmentGoal }>(
    { api: `${paths.api}/notes`, web: `${paths.web}/notes` },
    { method: "POST", body: JSON.stringify({ body }) },
  ).then((r) => r.data);
}
