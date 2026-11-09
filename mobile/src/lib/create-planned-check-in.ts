import { api } from "@/lib/api/api";
import { buildScheduledCheckInPayload } from "@/lib/regular-meeting-payload";

export type CreatePlannedCheckInInput = {
  memberUserId: string;
  memberName: string;
  startDate: Date;
  durationMinutes: number;
  templateId?: string | null;
  isVideoMeeting?: boolean;
};

export function buildPlannedCheckInPayload(input: CreatePlannedCheckInInput) {
  return buildScheduledCheckInPayload(input);
}

export async function createPlannedCheckIn(teamId: string, input: CreatePlannedCheckInInput) {
  return api.post(`/api/teams/${teamId}/events`, buildPlannedCheckInPayload(input));
}
