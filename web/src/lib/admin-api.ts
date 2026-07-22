import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "./api";

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
  /** Linked Organization = enterprise contract; otherwise self-serve Stripe/plan. */
  billingChannel?: "enterprise" | "self_serve";
  organization?: { id: string; name: string; accountType: string } | null;
  subscription: {
    plan: string;
    status: string;
    stripeCustomerId: string | null;
    currentPeriodEnd: string | null;
  };
};

export type AdminOrganizationRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  accountType?: string;
  ssoRequired: boolean;
  createdAt: string;
  workspaceCount: number;
  memberCount: number;
  domain: string | null;
  domainVerified: boolean;
  ssoEnabled: boolean;
  scimEnabled: boolean;
  defaultTeam: { id: string; name: string } | null;
};

export type AdminOrganizationDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  accountType?: string;
  ssoRequired: boolean;
  createdAt: string;
  updatedAt: string;
  defaultTeam: { id: string; name: string } | null;
  domains: Array<{ id: string; domain: string; verifiedAt: string | null }>;
  ssoConfig: {
    provider: string;
    protocol: string;
    enabled: boolean;
    issuer: string | null;
    clientId: string | null;
  } | null;
  scimConfig: { enabled: boolean; tokenPrefix: string | null } | null;
  teams: Array<{
    id: string;
    name: string;
    inviteCode: string;
    createdAt: string;
    _count: { members: number };
    subscription: { plan: string; status: string } | null;
  }>;
  memberships: Array<{
    id: string;
    role: string;
    joinedAt: string;
    user: { id: string; name: string; email: string };
  }>;
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

export async function fetchAdminOrganizations(): Promise<AdminOrganizationRow[]> {
  const res = await apiGetJson<{ data: AdminOrganizationRow[] }>("/api/admin/organizations");
  return (res.data ?? []).map((o) => normalizeCreatedAt(o));
}

export async function fetchAdminOrganization(organizationId: string): Promise<AdminOrganizationDetail> {
  const res = await apiGetJson<{ data: AdminOrganizationDetail }>(
    `/api/admin/organizations/${encodeURIComponent(organizationId)}`,
  );
  return {
    ...normalizeCreatedAt(res.data),
    updatedAt:
      typeof res.data.updatedAt === "string"
        ? res.data.updatedAt
        : new Date(res.data.updatedAt as unknown as string).toISOString(),
  };
}

export async function createAdminOrganization(body: {
  name: string;
  domain?: string;
  markDomainVerified?: boolean;
  ownerEmail?: string;
  ownerName?: string;
  ownerPassword?: string;
  initialWorkspaceName?: string;
  plan?: "free" | "team" | "pro" | "operations";
}): Promise<{
  organization: AdminOrganizationDetail;
  welcomeEmail: { sent: boolean; error?: string } | null;
}> {
  const res = await apiPostJson<{
    data: AdminOrganizationDetail;
    welcomeEmail?: { sent: boolean; error?: string } | null;
  }>("/api/admin/organizations", body);
  return {
    organization: normalizeCreatedAt(res.data),
    welcomeEmail: res.welcomeEmail ?? null,
  };
}

export async function attachAdminOrganizationTeam(
  organizationId: string,
  teamId: string,
): Promise<AdminOrganizationDetail> {
  const res = await apiPostJson<{ data: AdminOrganizationDetail }>(
    `/api/admin/organizations/${encodeURIComponent(organizationId)}/attach-team`,
    { teamId },
  );
  return normalizeCreatedAt(res.data);
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

/** Admin-only: distinguish enterprise contract customers from self-serve paid tiers. */
export function billingChannelLabel(team: {
  billingChannel?: "enterprise" | "self_serve";
  organization?: { name: string } | null;
  subscription: { plan: string };
}): string {
  if (team.billingChannel === "enterprise" || team.organization) {
    return team.organization?.name
      ? `Enterprise · ${team.organization.name}`
      : "Enterprise";
  }
  return `Self-serve · ${planLabel(team.subscription.plan)}`;
}
