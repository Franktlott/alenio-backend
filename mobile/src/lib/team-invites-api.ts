import { api } from "@/lib/api/api";

export type TeamInvite = {
  id: string;
  teamId: string;
  email: string;
  invitedById: string;
  status: string;
  acceptedUserId: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  invitedBy?: { id: string; name: string; email: string; image: string | null };
  acceptedUser?: { id: string; name: string; email: string; image: string | null } | null;
};

export type TeamInvitePreview = {
  email: string;
  found: boolean;
  alreadyMember: boolean;
  pendingInvite: boolean;
  user?: { id: string; name: string; email: string; image: string | null };
  workspaces?: Array<{
    id: string;
    name: string;
    image: string | null;
    role: string;
    isCurrentTeam: boolean;
  }>;
};

export function fetchTeamInvites(teamId: string) {
  return api.get<TeamInvite[]>(`/api/teams/${teamId}/invites`);
}

export function previewTeamInvite(teamId: string, email: string) {
  return api.post<TeamInvitePreview>(`/api/teams/${teamId}/invites/preview`, { email });
}

export function inviteMemberByEmail(teamId: string, email: string) {
  return api.post<{
    added: boolean;
    user?: { id: string; name: string; email: string; image: string | null };
    role?: string;
    invite?: TeamInvite;
    emailSent?: boolean;
  }>(`/api/teams/${teamId}/invites`, { email });
}

export function cancelTeamInvite(teamId: string, inviteId: string) {
  return api.delete<{ cancelled: boolean }>(`/api/teams/${teamId}/invites/${inviteId}`);
}

export function resendTeamInvite(teamId: string, inviteId: string) {
  return api.post<TeamInvite>(`/api/teams/${teamId}/invites/${inviteId}/resend`, {});
}

export function redeemTeamInvite(token: string) {
  return api.post<{ teamId: string; teamName: string }>("/api/team-invites/redeem", { token });
}
