import { PrismaClient } from "@prisma/client";
import {
  assertSafePeopleDevEnvironment,
  describePeopleDevDatabase,
} from "../src/lib/people-dev-seed";
import { projectMomentum, type MomentumOutcome } from "../src/lib/momentum-projection";

const SEED_PREFIX = "seed-workspace-network-";
const TEAM_ID = readArg("--team") ?? "123";
const VIEWER = readArg("--viewer") ?? "mrfranktlott@gmail.com";

const PEOPLE = [
  ["Ava Bennett", "ava.bennett", "Retail Training Lead", "photo-1494790108377-be9c29b29330"],
  ["Benjamin Carter", "benjamin.carter", "Assistant Store Manager", "photo-1500648767791-00dcc994a43e"],
  ["Camila Diaz", "camila.diaz", "Customer Experience Lead", "photo-1534528741775-53994a69daeb"],
  ["Daniel Evans", "daniel.evans", "Operations Specialist", "photo-1507003211169-0a1dd7228f2d"],
  ["Emma Foster", "emma.foster", "Shift Leader", "photo-1531123897727-8f129e1688ce"],
  ["Felix Grant", "felix.grant", "Food Service Manager", "photo-1506794778202-cad84cf45f1d"],
  ["Grace Hall", "grace.hall", "People Development Partner", "photo-1544005313-94ddf0286df2"],
  ["Henry Ingram", "henry.ingram", "Store Associate", "photo-1507591064344-4c6ce005b128"],
  ["Isabella James", "isabella.james", "Store Manager", "photo-1524504388940-b1c1722653e1"],
  ["Kai Kim", "kai.kim", "Training Coordinator", "photo-1508214751196-bcfd4ca60f91"],
  ["Leah Morgan", "leah.morgan", "District Trainer", "photo-1531746020798-e6953c6e8e04"],
  ["Marcus Nelson", "marcus.nelson", "Inventory Lead", "photo-1501196354995-cbb51c65aaea"],
  ["Nina Owens", "nina.owens", "Team Leader", "photo-1547425260-76bcadfb4f2c"],
  ["Owen Patel", "owen.patel", "Store Associate", "photo-1506794778202-cad84cf45f1d"],
  ["Paige Quinn", "paige.quinn", "Learning Specialist", "photo-1534528741775-53994a69daeb"],
  ["Rafael Santos", "rafael.santos", "General Manager", "photo-1507003211169-0a1dd7228f2d"],
  ["Samantha Turner", "samantha.turner", "Shift Leader", "photo-1494790108377-be9c29b29330"],
  ["Victor Underwood", "victor.underwood", "Facilities Lead", "photo-1500648767791-00dcc994a43e"],
  ["Willow Vega", "willow.vega", "Store Associate", "photo-1544005313-94ddf0286df2"],
  ["Zoe Young", "zoe.young", "Customer Experience Coach", "photo-1524504388940-b1c1722653e1"],
] as const;

const MOMENTUM_FIXTURES = [
  { streak: 6, personalBest: 8, overdue: 0 },
  { streak: 4, personalBest: 5, overdue: 0 },
  { streak: 3, personalBest: 7, overdue: 1 },
  { streak: 2, personalBest: 4, overdue: 0 },
  { streak: 1, personalBest: 3, overdue: 1 },
  { streak: 2, personalBest: 2, overdue: 0 },
  { streak: 0, personalBest: 5, overdue: 2 },
  { streak: 0, personalBest: 2, overdue: 1 },
  { streak: 0, personalBest: 0, overdue: 0 },
] as const;

function momentumHistory(streak: number, personalBest: number): boolean[] {
  if (personalBest === 0) return [];
  if (streak === personalBest) return Array.from({ length: personalBest }, () => true);
  return [
    ...Array.from({ length: personalBest }, () => true),
    false,
    ...Array.from({ length: streak }, () => true),
  ];
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join(":");
}

async function main() {
  assertSafePeopleDevEnvironment(
    { mode: "seed", viewer: VIEWER, confirmDev: true },
    process.env,
  );
  const database = describePeopleDevDatabase(process.env.DATABASE_URL!);
  console.log(
    `Workspace network seed target: host=${database.host} database=${database.database}`,
  );

  const prisma = new PrismaClient();
  try {
    const team = await prisma.team.findFirst({
      where: {
        OR: [
          { id: TEAM_ID },
          { name: { equals: TEAM_ID, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true },
    });
    if (!team) throw new Error(`Workspace ${TEAM_ID} was not found.`);

    const viewerInput = VIEWER.replace(/^@/, "");
    const viewer = await prisma.user.findFirst({
      where: {
        OR: [
          { id: VIEWER },
          { email: { equals: VIEWER, mode: "insensitive" } },
          { username: { equals: viewerInput, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true },
    });
    if (!viewer) throw new Error(`Viewer ${VIEWER} was not found.`);

    const now = new Date();
    for (const [index, [name, username, title, photoId]] of PEOPLE.entries()) {
      const id = `${SEED_PREFIX}${username.replace(/\./g, "-")}`;
      await prisma.user.upsert({
        where: { id },
        update: {
          name,
          username,
          image: `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=256&h=256&q=80`,
          profileTitle: title,
          profileOrganization: team.name,
          lastActiveAt:
            index < 6 ? new Date(now.getTime() - index * 4 * 60 * 1000) : null,
          showActiveStatus: true,
          discoverableByEmail: true,
          emailVerified: true,
        },
        create: {
          id,
          name,
          username,
          email: `${username}@workspace-demo.invalid`,
          image: `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=256&h=256&q=80`,
          profileTitle: title,
          profileOrganization: team.name,
          lastActiveAt:
            index < 6 ? new Date(now.getTime() - index * 4 * 60 * 1000) : null,
          showActiveStatus: true,
          discoverableByEmail: true,
          emailVerified: true,
        },
      });
      await prisma.teamMember.upsert({
        where: { userId_teamId: { userId: id, teamId: team.id } },
        update: {
          role: index % 7 === 0 ? "team_leader" : "member",
        },
        create: {
          userId: id,
          teamId: team.id,
          role: index % 7 === 0 ? "team_leader" : "member",
        },
      });
      const connectionKey = pairKey(viewer.id, id);
      await prisma.connection.upsert({
        where: { pairKey: connectionKey },
        update: { status: "accepted" },
        create: {
          requesterId: viewer.id,
          recipientId: id,
          status: "accepted",
          pairKey: connectionKey,
        },
      });
    }

    // Credits intentionally survive task deletion in production. Seed cleanup is
    // explicit so reruns replace only this fixture's canonical history.
    await prisma.momentumCompletionCredit.deleteMany({
      where: {
        teamId: team.id,
        sourceTaskId: { startsWith: `${SEED_PREFIX}momentum-` },
      },
    });
    await prisma.task.deleteMany({
      where: {
        teamId: team.id,
        id: { startsWith: `${SEED_PREFIX}momentum-` },
      },
    });
    for (const [personIndex, [, username]] of PEOPLE.entries()) {
      const momentum = MOMENTUM_FIXTURES[personIndex] ?? {
        streak: 0,
        personalBest: 0,
        overdue: 0,
      };
      const userId = `${SEED_PREFIX}${username.replace(/\./g, "-")}`;
      const member = await prisma.teamMember.findUniqueOrThrow({
        where: { userId_teamId: { userId, teamId: team.id } },
        select: { id: true },
      });
      const history = momentumHistory(momentum.streak, momentum.personalBest);
      const outcomes: MomentumOutcome[] = [];

      for (const [taskIndex, onTime] of history.entries()) {
        const taskId = `${SEED_PREFIX}momentum-${team.id}-${personIndex + 1}-${taskIndex + 1}`;
        const completedAt = new Date(
          now.getTime() - (history.length - taskIndex) * 24 * 60 * 60 * 1000,
        );
        const dueDate = new Date(
          completedAt.getTime() + (onTime ? 2 : -2) * 60 * 60 * 1000,
        );
        const title = onTime
          ? "Momentum demo · completed on time"
          : "Momentum demo · completed late";
        await prisma.task.create({
          data: {
            id: taskId,
            title,
            description: "Development fixture for the Team Momentum view.",
            kind: "workspace_task",
            momentumEligible: true,
            status: "done",
            priority: "medium",
            dueDate,
            completedAt,
            teamId: team.id,
            creatorId: viewer.id,
            assignments: { create: { userId } },
          },
        });
        const creditId = `${taskId}-credit`;
        await prisma.momentumCompletionCredit.create({
          data: {
            id: creditId,
            teamId: team.id,
            sourceTaskId: taskId,
            creditedUserId: userId,
            creditedTeamMemberId: member.id,
            sourceTaskTitle: title,
            sourceTaskIncognito: false,
            dueAt: dueDate,
            completedAt,
            onTime,
          },
        });
        outcomes.push({ id: creditId, completedAt, onTime });
      }

      for (let overdueIndex = 0; overdueIndex < momentum.overdue; overdueIndex += 1) {
        const taskId = `${SEED_PREFIX}momentum-${team.id}-${personIndex + 1}-overdue-${overdueIndex + 1}`;
        await prisma.task.create({
          data: {
            id: taskId,
            title: "Momentum demo · overdue",
            description: "Development fixture for the Team Momentum view.",
            kind: "workspace_task",
            momentumEligible: true,
            status: "todo",
            priority: "medium",
            dueDate: new Date(now.getTime() - (overdueIndex + 1) * 24 * 60 * 60 * 1000),
            teamId: team.id,
            creatorId: viewer.id,
            assignments: { create: { userId } },
          },
        });
      }

      const projection = projectMomentum(outcomes);
      if (
        projection.currentStreak !== momentum.streak ||
        projection.personalBestStreak !== momentum.personalBest
      ) {
        throw new Error(`Invalid Momentum fixture for ${username}.`);
      }
      await prisma.teamMember.update({
        where: { id: member.id },
        data: { ...projection, personalBestCelebrated: false },
      });
      await prisma.user.update({
        where: { id: userId },
        data: {
          personalBestStreak: projection.personalBestStreak,
          personalBestCelebrated: false,
        },
      });
    }

    console.log(
      `Seeded ${PEOPLE.length} workspace members, including ${MOMENTUM_FIXTURES.length} momentum profiles, into ${team.name} (${team.id}) for ${viewer.name} (${viewer.email}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Workspace network seed failed.",
  );
  process.exitCode = 1;
});
