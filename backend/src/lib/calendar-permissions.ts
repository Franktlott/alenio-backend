/** Owner or team leader — can manage the shared team calendar and virtual meetings. */
export function isCalendarOwnerOrLeader(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

/** Roles that can manage any team member's calendar entry. */
export function isCalendarManagerRole(role: string): boolean {
  return isCalendarOwnerOrLeader(role) || role === "admin";
}

export function isPaidTeamPlan(plan: string | null | undefined): boolean {
  return plan === "team" || plan === "pro";
}

export type CalendarEventWriteInput = {
  isVideoMeeting?: boolean;
  isHidden?: boolean;
};

export type CalendarCreateResolution =
  | { ok: true; isHidden: boolean; isVideoMeeting: boolean }
  | { ok: false; message: string };

/** Resolve create permissions and the stored visibility/type flags. */
export function resolveCalendarCreate(
  role: string,
  isPaid: boolean,
  input: CalendarEventWriteInput,
): CalendarCreateResolution {
  const wantsVideo = input.isVideoMeeting === true;
  const wantsPublic = input.isHidden === false;

  if (isCalendarOwnerOrLeader(role)) {
    return {
      ok: true,
      isHidden: input.isHidden ?? false,
      isVideoMeeting: wantsVideo,
    };
  }

  if (!isPaid) {
    return { ok: false, message: "Personal calendar entries require a Team plan." };
  }
  if (wantsVideo) {
    return { ok: false, message: "Only workspace owners and team leaders can schedule virtual meetings." };
  }
  if (wantsPublic) {
    return { ok: false, message: "Only workspace owners and team leaders can add public team calendar events." };
  }

  return { ok: true, isHidden: true, isVideoMeeting: false };
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
  | { ok: true; enforceHidden?: boolean; forbidVideo?: boolean }
  | { ok: false; message: string };

/** Validate update/delete permission and member restrictions on visibility/video. */
export function resolveCalendarUpdate(
  role: string,
  userId: string,
  existing: { createdById: string; isVideoMeeting: boolean },
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
    if (body.isHidden === false) {
      return { ok: false, message: "Only workspace owners and team leaders can make events public." };
    }
    return { ok: true, enforceHidden: true, forbidVideo: true };
  }

  if (body.isVideoMeeting === true && !isCalendarOwnerOrLeader(role)) {
    return { ok: false, message: "Only workspace owners and team leaders can schedule virtual meetings." };
  }

  return { ok: true };
}
