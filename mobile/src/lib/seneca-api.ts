import { api } from "@/lib/api/api";

export type SenecaAskActionId =
  | "view_overdue_tasks"
  | "schedule_check_in"
  | "create_recognition"
  | "create_follow_up_task"
  | "build_checklist"
  | "open_team";

export type SenecaPlanOneOnOneProposal = {
  memberUserId: string;
  memberName: string;
  startDate: string;
  durationMinutes: number;
  dateLabel: string;
  timeLabel: string;
};

export type SenecaAskResponse = {
  available: boolean;
  message: string;
  insights?: Array<{ label: string; detail?: string }>;
  suggestedActions?: Array<{
    title: string;
    description: string;
    action: SenecaAskActionId;
  }>;
  planOneOnOne?: SenecaPlanOneOnOneProposal | null;
};

export function fetchSenecaAsk(teamId: string, question: string) {
  return api.post<SenecaAskResponse>(`/api/teams/${teamId}/seneca/ask`, { question });
}
