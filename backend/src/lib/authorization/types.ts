export type AuthzActor = {
  userId: string;
};

export type AuthzAction =
  | "task.view"
  | "event.view"
  | "goal.view"
  | "checkin.view_summary"
  | "checkin.view_leader_notes"
  | "checkin.view_transcript"
  | "checkin.view_audio"
  | "checkin.list_member"
  | "chat.view"
  | "billing.view"
  | "workspace.admin"
  | "seneca.use";

export type AuthzResourceRef =
  | { type: "workspace"; id: string }
  | { type: "task"; id: string }
  | { type: "event"; id: string }
  | { type: "goal"; id: string }
  | { type: "checkin"; id: string }
  | { type: "recording"; id: string }
  | { type: "conversation"; id: string };

export type AuthzDecision =
  | {
      allow: true;
      workspaceId: string | null;
      role: string | null;
    }
  | {
      allow: false;
      code: "NOT_FOUND" | "POLICY_UNDEFINED";
      message: string;
      workspaceId: string | null;
    };

export const AUTHZ_NOT_FOUND_MESSAGE = "Not found";
export const AUTHZ_CROSS_ORG_MESSAGE =
  "Combining workspaces from different organizations is not enabled.";
