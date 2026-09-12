export function actorFromSession(user: { id: string } | null | undefined): {
  userId: string;
} | null {
  if (!user?.id) return null;
  return { userId: user.id };
}
