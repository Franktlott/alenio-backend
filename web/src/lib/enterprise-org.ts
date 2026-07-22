import type { WebEnterpriseOrganization, WebMeUser } from "./api";

export function enterpriseOrgsForUser(me: WebMeUser | null | undefined): WebEnterpriseOrganization[] {
  if (!me?.organizations?.length) return [];
  return me.organizations.filter((o) => (o.accountType || "enterprise") === "enterprise");
}

export function isEnterpriseOrgMember(me: WebMeUser | null | undefined): boolean {
  return enterpriseOrgsForUser(me).length > 0;
}

export function isEnterpriseOrgAdmin(me: WebMeUser | null | undefined): boolean {
  return enterpriseOrgsForUser(me).some((o) => o.role === "org_owner" || o.role === "org_admin");
}

export function primaryEnterpriseOrg(me: WebMeUser | null | undefined): WebEnterpriseOrganization | null {
  const orgs = enterpriseOrgsForUser(me);
  return orgs[0] ?? null;
}

export function enterpriseOrgTeams(me: WebMeUser | null | undefined) {
  return enterpriseOrgsForUser(me).flatMap((o) =>
    o.teams.map((t) => ({
      ...t,
      organizationId: o.id,
      organizationName: o.name,
      orgRole: o.role,
    })),
  );
}

export function canManageEnterpriseGoForTeam(
  me: WebMeUser | null | undefined,
  teamId: string | undefined,
): boolean {
  if (!teamId || !me) return false;
  return enterpriseOrgsForUser(me).some(
    (o) =>
      (o.role === "org_owner" || o.role === "org_admin") && o.teams.some((t) => t.id === teamId),
  );
}

/** True when `teamId` is a personal membership or an enterprise org workspace the user can access. */
export function isKnownEnterpriseWorkspace(
  me: WebMeUser | null | undefined,
  personalTeams: Array<{ id: string }> | null | undefined,
  teamId: string | undefined,
): boolean {
  const id = teamId?.trim() ?? "";
  if (!id) return false;
  if (personalTeams?.some((t) => t.id === id)) return true;
  return enterpriseOrgTeams(me).some((t) => t.id === id);
}
