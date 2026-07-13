/**
 * Postgres `User.id` from global auth middleware (`syncAppUserFromAuth`).
 * Can differ from the Neon JWT subject when an existing row was matched by email.
 */
export function webPrismaUserIdFromContext(c: { get: (key: "user") => unknown }): string | null {
  const u = c.get("user") as { id?: string } | null | undefined;
  const id = u?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
