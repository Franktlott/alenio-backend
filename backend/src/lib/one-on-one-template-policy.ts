import { canManageCheckIns } from "./workspace-role-policy";

export type CheckInTemplateCalendarReference = {
  isOneOnOne: boolean;
  oneOnOneTemplateId: string | null;
  startDate: Date;
  isHidden: boolean;
  approvalStatus: string;
};

export type CheckInTemplateDeletionBlock =
  | "required_by_workspace_standards"
  | "future_scheduled_check_in";

export function canManageCheckInTemplates(role: string | null | undefined): boolean {
  return canManageCheckIns(role);
}

export function isBlockingCheckInTemplateCalendarReference(
  event: CheckInTemplateCalendarReference,
  templateId: string,
  now = new Date(),
): boolean {
  return (
    event.isOneOnOne &&
    event.oneOnOneTemplateId === templateId &&
    event.startDate.getTime() > now.getTime() &&
    !event.isHidden &&
    (event.approvalStatus === "approved" || event.approvalStatus === "pending")
  );
}

export function getCheckInTemplateDeletionBlock(input: {
  templateId: string;
  requiredCheckInTemplateId: string | null;
  calendarReferences: CheckInTemplateCalendarReference[];
  now?: Date;
}): CheckInTemplateDeletionBlock | null {
  if (input.requiredCheckInTemplateId === input.templateId) {
    return "required_by_workspace_standards";
  }

  const now = input.now ?? new Date();
  if (
    input.calendarReferences.some((event) =>
      isBlockingCheckInTemplateCalendarReference(event, input.templateId, now),
    )
  ) {
    return "future_scheduled_check_in";
  }

  return null;
}
