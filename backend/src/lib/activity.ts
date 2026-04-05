import { prisma } from "../prisma";

export async function logActivity(params: {
  teamId: string;
  userId?: string;
  type: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.teamActivity.create({
    data: {
      teamId: params.teamId,
      userId: params.userId ?? null,
      type: params.type,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
