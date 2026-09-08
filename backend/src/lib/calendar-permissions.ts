import { canManageWorkspaceCalendar } from "./workspace-role-policy";

/** Owner or team leader — can manage the shared team calendar and virtual meetings. */
export function isCalendarOwnerOrLeader(role: string): boolean {
  return canManageWorkspaceCalendar(role);
}

/** Roles that can manage any team member's calendar entry. */
export function isCalendarManagerRole(role: string): boolean {
  return canManageWorkspaceCalendar(role);
}

export type CalendarApprovalStatus = "pending" | "approved" | "rejected";

export type CalendarEventWriteInput = {
  isVideoMeeting?: boolean;
  isHidden?: boolean;
};

export type CalendarEventVisibility = {
  isHidden: boolean;
  approvalStatus?: string | null;
  createdById: string;
  isVideoMeeting?: boolean;
  isOneOnOne?: boolean;
};

export function canViewCalendarEvent(
  event: CalendarEventVisibility,
  userId: string,
  _role: string,
  assigneeIds: string[] = [],
): boolean {
  if (event.isHidden) {
    if (event.createdById === userId) return true;
    if (assigneeIds.includes(userId) && (event.isVideoMeeting || event.isOneOnOne)) return true;
    return false;
  }

  const status = (event.approvalStatus ?? "approved") as CalendarApprovalStatus;
  return status === "approved";
}

export function canApproveCalendarEvent(role: string): boolean {
  return isCalendarOwnerOrLeader(role);
}

export type CalendarCreateResolution =
  | { ok: true; isHidden: boolean; isVideoMeeting: boolean; approvalStatus: CalendarApprovalStatus }
  | { ok: false; message: string };

/** Resolve create permissions and the stored visibility/type flags. */
export function resolveCalendarCreate(
  role: string,
  input: CalendarEventWriteInput,
): CalendarCreateResolution {
  const wantsVideo = input.isVideoMeeting === true;
  const wantsPublic = input.isHidden === false;

  if (wantsVideo && !isCalendarOwnerOrLeader(role)) {
    return { ok: false, message: "Only workspace owners and team leaders can schedule virtual meetings." };
  }

  if (isCalendarOwnerOrLeader(role)) {
    return {
      ok: true,
      isHidden: input.isHidden ?? false,
      isVideoMeeting: wantsVideo,
      approvalStatus: "approved",
    };
  }

  if (wantsPublic) {
    return {
      ok: true,
      isHidden: false,
      isVideoMeeting: false,
      approvalStatus: "pending",
    };
  }

  return {
    ok: true,
    isHidden: true,
    isVideoMeeting: false,
    approvalStatus: "approved",
  };
}

export function canManageCalendarEvent(
  role: string,
  userId: string,
  event: { createdById: string },
): boolean {
  if (event.createdById === userId) return true;
  return isCalendarManagerRole(role);
}

export type CalendarUpdateResolution =
  | { ok: true; forbidVideo?: boolean; resetApproval?: CalendarApprovalStatus }
  | { ok: false; message: string };

/** Validate update/delete permission and member restrictions on visibility/video. */
export function resolveCalendarUpdate(
  role: string,
  userId: string,
  existing: {
    createdById: string;
    isVideoMeeting: boolean;
    isHidden: boolean;
    approvalStatus: string;
  },
  body: CalendarEventWriteInput,
): CalendarUpdateResolution {
  if (!canManageCalendarEvent(role, userId, existing)) {
    return { ok: false, message: "You can only edit your own calendar entries." };
  }

  if (!isCalendarManagerRole(role)) {
    if (existing.isVideoMeeting) {
      return { ok: false, message: "Only workspace owners and team leaders can edit virtual meetings." };
    }
    if (body.isVideoMeeting === true) {
      return { ok: false, message: "Only workspace owners and team leaders can schedule virtual meetings." };
    }

    const nextIsHidden = body.isHidden ?? existing.isHidden;
    const resetApproval: CalendarApprovalStatus = nextIsHidden
      ? "approved"
      : "pending";

    return { ok: true, forbidVideo: true, resetApproval };
  }

  if (body.isVideoMeeting === true && !isCalendarOwnerOrLeader(role)) {
    return { ok: false, message: "Only workspace owners and team leaders can schedule virtual meetings." };
  }

  if (body.isHidden === true && existing.approvalStatus !== "approved") {
    return { ok: true, resetApproval: "approved" };
  }

  return { ok: true };
}
