type MembershipCountRow = {
  _count: {
    teamMembers: number;
  };
};

/** A TeamMember row is the canonical active membership; invitations live separately. */
export function isWorkplaceConnected(row: MembershipCountRow): boolean {
  return row._count.teamMembers > 0;
}

export function serializeWorkplaceConnectedUser<
  T extends MembershipCountRow & Record<string, unknown>,
>(row: T): Omit<T, "_count"> & { isWorkplaceConnected: boolean } {
  const { _count, ...user } = row;
  return {
    ...user,
    isWorkplaceConnected: _count.teamMembers > 0,
  };
}
