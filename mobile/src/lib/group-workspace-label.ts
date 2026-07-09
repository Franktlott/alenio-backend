export type GroupWorkspaceContext = {
  label: string;
  workspaces: Array<{ id: string; name: string }>;
  isCrossWorkspace: boolean;
};

export type GroupMemberCandidate = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  workspaces: Array<{ id: string; name: string }>;
  workspaceLabel: string;
};

export function groupWorkspaceLabel(context?: GroupWorkspaceContext | null): string | null {
  const label = context?.label?.trim();
  return label ? label : null;
}
