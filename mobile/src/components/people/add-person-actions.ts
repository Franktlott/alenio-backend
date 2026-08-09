export type AddPersonActionKey = "connect" | "invite";

export function addPersonActionKeys(
  canInviteWorkspaceMembers: boolean,
): AddPersonActionKey[] {
  return canInviteWorkspaceMembers ? ["connect", "invite"] : ["connect"];
}
