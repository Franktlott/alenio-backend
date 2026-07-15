import { apiDeleteJson, apiGetJson, apiPatchJson } from "./api";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  isAdmin: boolean;
  _count: { teamMembers: number };
};

export type AdminUserDetail = AdminUserRow & {
  emailVerified: boolean;
  _count: { teamMembers: number; tasksCreated: number };
  teamMembers: Array<{
    role: string;
    joinedAt: string;
    team: { id: string; name: string };
  }>;
};

export type AdminTeamRow = {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  memberCount: number;
  taskCount: number;
  owner: { id: string; name: string; email: string } | null;
  subscription: {
    plan: string;
    status: string;
    stripeCustomerId: string | null;
    currentPeriodEnd: string | null;
  };
};

function normalizeCreatedAt<T extends { createdAt: string | Date }>(row: T): T & { createdAt: string } {
  return {
    ...row,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date(row.createdAt).toISOString(),
  };
}

export async function fetchAdminUsers(q?: string): Promise<AdminUserRow[]> {
  const params = new URLSearchParams();
  const trimmed = q?.trim();
  if (trimmed) params.set("q", trimmed);
  const qs = params.toString();
  const path = qs ? `/api/admin/users?${qs}` : "/api/admin/users";
  const res = await apiGetJson<{ data: AdminUserRow[] }>(path);
  return (res.data ?? []).map((u) => normalizeCreatedAt(u));
}

export async function fetchAdminUser(id: string): Promise<AdminUserDetail> {
  const res = await apiGetJson<{ data: AdminUserDetail }>(`/api/admin/users/${encodeURIComponent(id)}`);
  return normalizeCreatedAt(res.data);
}

export async function setAdminUserPlatformAdmin(id: string, isAdmin: boolean): Promise<AdminUserRow> {
  const res = await apiPatchJson<{ data: AdminUserRow }>(`/api/admin/users/${encodeURIComponent(id)}/admin`, {
    isAdmin,
  });
  return normalizeCreatedAt(res.data);
}

export async function deleteAdminUser(id: string): Promise<{ deleted: boolean }> {
  const res = await apiDeleteJson<{ data: { deleted: boolean } }>(`/api/admin/users/${encodeURIComponent(id)}`);
  return res.data;
}

export async function fetchAdminTeams(): Promise<AdminTeamRow[]> {
  const res = await apiGetJson<{ data: AdminTeamRow[] }>("/api/admin/teams");
  return (res.data ?? []).map((t) => normalizeCreatedAt(t));
}

export function formatAdminDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function planLabel(plan: string): string {
  if (plan === "operations") return "Operations";
  if (plan === "team" || plan === "pro") return "Pro";
  return "Free";
}
