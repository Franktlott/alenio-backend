import { Hono } from "hono";
import { prisma } from "../prisma";
import { createEmailPasswordUser } from "../auth";

const demoRouter = new Hono();

const DEMO_EMAIL = "demo@alenio.app";
const DEMO_PASSWORD = "Demo1234!";
const DEMO_TEAM_NAME = "Alenio Product Team";

// POST /api/demo/login — seeds demo data and returns credentials for the demo user
demoRouter.post("/login", async (c) => {
  try {
    // 1. Ensure demo user exists
    let demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

    if (!demoUser) {
      await createEmailPasswordUser(DEMO_EMAIL, DEMO_PASSWORD, "Alex Chen");
      demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
      if (!demoUser) return c.json({ error: { message: "Failed to create demo user" } }, 500);
    }

    // 2. Ensure demo team exists (idempotent)
    const existingTeam = await prisma.team.findFirst({
      where: { name: DEMO_TEAM_NAME, members: { some: { userId: demoUser.id, role: "owner" } } },
    });

    if (!existingTeam) {
      await seedDemoData(demoUser.id);
    }

    return c.json({ data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  } catch (err) {
    console.error("[demo] Error:", err);
    return c.json({ error: { message: "Demo setup failed" } }, 500);
  }
});

async function seedDemoData(ownerId: string) {
  const now = new Date();
  const d = (offsetDays: number, h = 0, m = 0) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + offsetDays);
    dt.setHours(h, m, 0, 0);
    return dt;
  };

  // ── Fake team members (no auth accounts needed) ──────────────────────────
  // Always use returned DB IDs so repeated seeds don't break foreign keys.
  const memberDefs = [
    { seedId: "demo-sarah-m", name: "Sarah Mitchell", email: "sarah.m@alenio-demo.app" },
    { seedId: "demo-marcus-j", name: "Marcus Johnson", email: "marcus.j@alenio-demo.app" },
    { seedId: "demo-jordan-l", name: "Jordan Lee", email: "jordan.l@alenio-demo.app" },
    { seedId: "demo-elena-r", name: "Elena Rodriguez", email: "elena.r@alenio-demo.app" },
    { seedId: "demo-tyler-p", name: "Tyler Park", email: "tyler.p@alenio-demo.app" },
  ] as const;

  const memberIdsByEmail = new Map<string, string>();
  for (const m of memberDefs) {
    const user = await prisma.user.upsert({
      where: { email: m.email },
      update: { name: m.name, emailVerified: true },
      create: {
        id: m.seedId,
        name: m.name,
        email: m.email,
        emailVerified: true,
        updatedAt: now,
      },
      select: { id: true, email: true },
    });
    memberIdsByEmail.set(user.email, user.id);
  }

  const sarah = memberIdsByEmail.get("sarah.m@alenio-demo.app");
  const marcus = memberIdsByEmail.get("marcus.j@alenio-demo.app");
  const jordan = memberIdsByEmail.get("jordan.l@alenio-demo.app");
  const elena = memberIdsByEmail.get("elena.r@alenio-demo.app");
  const tyler = memberIdsByEmail.get("tyler.p@alenio-demo.app");
  if (!sarah || !marcus || !jordan || !elena || !tyler) {
    throw new Error("Failed to resolve seeded member IDs");
  }

  // ── Team ─────────────────────────────────────────────────────────────────
  const team = await prisma.team.create({
    data: {
      name: DEMO_TEAM_NAME,
      inviteCode: `DEMO${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      members: {
        create: [
          { userId: ownerId, role: "owner" },
          { userId: sarah, role: "team_leader" },
          { userId: marcus, role: "member" },
          { userId: jordan, role: "member" },
          { userId: elena, role: "member" },
          { userId: tyler, role: "member" },
        ],
      },
    },
  });

  // ── Topics/Channels ───────────────────────────────────────────────────────
  const generalTopic = await prisma.topic.create({
    data: { name: "General", description: "Team-wide updates and announcements", color: "#4361EE", teamId: team.id, createdById: ownerId },
  });
  const designTopic = await prisma.topic.create({
    data: { name: "Design", description: "Design discussions and feedback", color: "#7C3AED", teamId: team.id, createdById: sarah },
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const taskDefs = [
    {
      title: "Design new onboarding flow",
      description: "Redesign user onboarding based on Q1 user research. Focus on reducing time-to-value.",
      status: "in_progress", priority: "high", dueDate: d(7), creatorId: sarah,
      assignees: [sarah, jordan],
      subtasks: [
        { title: "Audit current onboarding", completed: true, order: 0 },
        { title: "Create wireframes", completed: true, order: 1 },
        { title: "Design hi-fi mockups", completed: false, order: 2 },
        { title: "Prototype & user test", completed: false, order: 3 },
      ],
    },
    {
      title: "Write Q2 product roadmap",
      description: "Document product strategy and feature priorities for Q2, aligned with company OKRs.",
      status: "done", priority: "medium", dueDate: d(-1), completedAt: d(-1),
      creatorId: ownerId, assignees: [ownerId], subtasks: [],
    },
    {
      title: "Fix login bug on Android",
      description: "Users on Android 13+ report intermittent login failures — affects ~12% of users.",
      status: "todo", priority: "urgent", dueDate: d(-1), // overdue
      creatorId: marcus, assignees: [marcus],
      subtasks: [
        { title: "Reproduce the issue", completed: true, order: 0 },
        { title: "Identify root cause", completed: false, order: 1 },
        { title: "Write the fix", completed: false, order: 2 },
        { title: "Test on Android 13+", completed: false, order: 3 },
      ],
    },
    {
      title: "Update API documentation",
      description: "Sync API docs with v2 endpoints released last sprint.",
      status: "in_progress", priority: "low", dueDate: d(6),
      creatorId: ownerId, assignees: [tyler], subtasks: [],
    },
    {
      title: "Prepare Series A investor deck",
      description: "Build the pitch deck with updated metrics, traction data, and product demos.",
      status: "todo", priority: "high", dueDate: d(5),
      creatorId: ownerId, assignees: [ownerId, sarah],
      subtasks: [
        { title: "Gather key metrics", completed: false, order: 0 },
        { title: "Draft narrative arc", completed: false, order: 1 },
        { title: "Design final slides", completed: false, order: 2 },
      ],
    },
    {
      title: "User interviews — Feature X discovery",
      description: "Conduct 8 user interviews to validate the Feature X hypothesis before development.",
      status: "done", priority: "medium", dueDate: d(-2), completedAt: d(-2),
      creatorId: jordan, assignees: [jordan, elena], subtasks: [],
    },
    {
      title: "Set up CI/CD pipeline",
      description: "Automate build, test, and deploy workflows with GitHub Actions.",
      status: "todo", priority: "medium", dueDate: d(8),
      creatorId: marcus, assignees: [marcus],
      subtasks: [
        { title: "Set up GitHub Actions", completed: false, order: 0 },
        { title: "Configure staging deploy", completed: false, order: 1 },
        { title: "Add test coverage gates", completed: false, order: 2 },
      ],
    },
    {
      title: "Revamp notification system",
      description: "Overhaul push notifications to support rich alerts, digest mode, and user preferences.",
      status: "in_progress", priority: "medium", dueDate: d(9),
      creatorId: ownerId, assignees: [elena],
      subtasks: [
        { title: "Audit current system", completed: true, order: 0 },
        { title: "Design new architecture", completed: true, order: 1 },
        { title: "Implement digest mode", completed: false, order: 2 },
      ],
    },
    {
      title: "A/B test new pricing page",
      description: "Run a 2-week A/B test on the pricing page to validate the new tier structure.",
      status: "done", priority: "high", dueDate: d(-7), completedAt: d(-7),
      creatorId: sarah, assignees: [sarah, elena], subtasks: [],
    },
    {
      title: "Migrate to TypeScript strict mode",
      description: "Enable strict TypeScript compilation and fix all resulting type errors.",
      status: "todo", priority: "low", dueDate: d(14),
      creatorId: marcus, assignees: [marcus, tyler], subtasks: [],
    },
    {
      title: "Launch referral program",
      description: "Build and ship the in-app referral flow to drive organic growth.",
      status: "todo", priority: "high", dueDate: d(10),
      creatorId: ownerId, assignees: [ownerId, jordan, elena],
      subtasks: [
        { title: "Define referral mechanics", completed: false, order: 0 },
        { title: "Design share screen", completed: false, order: 1 },
        { title: "Implement backend logic", completed: false, order: 2 },
        { title: "QA & launch", completed: false, order: 3 },
      ],
    },
    {
      title: "Accessibility audit",
      description: "Run a full accessibility audit and fix all P0/P1 issues before the next major release.",
      status: "in_progress", priority: "medium", dueDate: d(4),
      creatorId: sarah, assignees: [sarah, tyler],
      subtasks: [
        { title: "Run automated a11y scan", completed: true, order: 0 },
        { title: "Manual screen-reader test", completed: false, order: 1 },
        { title: "Fix identified issues", completed: false, order: 2 },
      ],
    },
  ];

  for (const { assignees, subtasks, ...fields } of taskDefs) {
    await prisma.task.create({
      data: {
        ...fields,
        teamId: team.id,
        assignments: { create: assignees.map((userId) => ({ userId })) },
        subtasks: subtasks.length ? { create: subtasks } : undefined,
      },
    });
  }

  // ── Calendar Events ───────────────────────────────────────────────────────
  await prisma.calendarEvent.createMany({
    data: [
      { title: "Daily Standup", description: "Quick sync — done, doing, blockers.", startDate: d(0, 9, 30), endDate: d(0, 9, 45), allDay: false, color: "#10B981", teamId: team.id, createdById: ownerId },
      { title: "Sprint Planning", description: "Plan tasks and goals for the upcoming sprint.", startDate: d(1, 9, 0), endDate: d(1, 10, 30), allDay: false, color: "#4361EE", teamId: team.id, createdById: ownerId },
      { title: "Design Review", description: "Review new onboarding flow designs with the full team.", startDate: d(3, 14, 0), endDate: d(3, 15, 0), allDay: false, color: "#7C3AED", teamId: team.id, createdById: sarah },
      { title: "Investor Meeting", description: "Series A pitch meeting with Sequoia partners.", startDate: d(5, 13, 0), allDay: false, endDate: d(5, 14, 0), color: "#F59E0B", teamId: team.id, createdById: ownerId },
      { title: "Q2 Kickoff", description: "All-hands to kick off Q2 goals and strategy.", startDate: d(7), allDay: true, color: "#EF4444", teamId: team.id, createdById: ownerId },
      { title: "1:1 with Sarah", description: "Weekly sync with team lead.", startDate: d(2, 10, 0), endDate: d(2, 10, 30), allDay: false, color: "#06B6D4", teamId: team.id, createdById: ownerId },
    ],
  });

  // ── Team Activity ─────────────────────────────────────────────────────────
  const activitiesDefs = [
    { type: "member_joined", userId: sarah, metadata: { name: "Sarah Mitchell" }, ago: 7 },
    { type: "member_joined", userId: marcus, metadata: { name: "Marcus Johnson" }, ago: 6 },
    { type: "member_joined", userId: elena, metadata: { name: "Elena Rodriguez" }, ago: 5.5 },
    { type: "task_assigned", userId: ownerId, metadata: { taskTitle: "Design new onboarding flow", assigneeName: "Sarah Mitchell" }, ago: 5 },
    { type: "calendar_event_added", userId: ownerId, metadata: { eventTitle: "Sprint Planning" }, ago: 3 },
    { type: "task_completed", userId: sarah, metadata: { taskTitle: "A/B test new pricing page" }, ago: 4 },
    { type: "task_completed", userId: jordan, metadata: { taskTitle: "User interviews — Feature X discovery" }, ago: 2 },
    { type: "task_completed", userId: ownerId, metadata: { taskTitle: "Write Q2 product roadmap" }, ago: 1 },
    { type: "member_joined", userId: tyler, metadata: { name: "Tyler Park" }, ago: 4.5 },
    { type: "task_milestone", userId: sarah, metadata: { taskTitle: "Design new onboarding flow", milestone: "Wireframes complete" }, ago: 0.5 },
  ];

  const createdActivities: string[] = [];
  for (const { ago, metadata, ...fields } of activitiesDefs) {
    const act = await prisma.teamActivity.create({
      data: { ...fields, teamId: team.id, metadata: JSON.stringify(metadata), createdAt: new Date(now.getTime() - ago * 24 * 60 * 60 * 1000) },
    });
    createdActivities.push(act.id);
  }

  // Reactions on activities
  if (createdActivities.length >= 8) {
    await prisma.teamActivityReaction.createMany({
      data: [
        { emoji: "🎉", userId: ownerId, activityId: createdActivities[0]! },
        { emoji: "👏", userId: marcus, activityId: createdActivities[0]! },
        { emoji: "🔥", userId: sarah, activityId: createdActivities[7]! },
        { emoji: "💪", userId: jordan, activityId: createdActivities[7]! },
        { emoji: "🎉", userId: marcus, activityId: createdActivities[6]! },
        { emoji: "⚡", userId: ownerId, activityId: createdActivities[9]! },
      ],
    });
  }

  // ── Team Messages ─────────────────────────────────────────────────────────
  const msgDefs = [
    { content: "Hey team! Excited to kick off this sprint 🚀 Let's make it count!", senderId: ownerId, topicId: generalTopic.id, hoursAgo: 144 },
    { content: "Sprint planning doc is ready — check Notion. Key focus: onboarding redesign + Android fix. Drop questions here 👇", senderId: sarah, topicId: generalTopic.id, hoursAgo: 120 },
    { content: "Finished all 8 user interviews. Summary posted. TL;DR: users love the core loop, want a faster setup experience.", senderId: jordan, topicId: generalTopic.id, hoursAgo: 72 },
    { content: "Q2 roadmap is done ✅ Please review and leave comments by Friday. Big push on growth features next quarter.", senderId: ownerId, topicId: generalTopic.id, hoursAgo: 24 },
    { content: "Standup in 15 min! 🕐", senderId: sarah, topicId: generalTopic.id, hoursAgo: 2 },
    { content: "Hi everyone! First hi-fi screens for the onboarding redesign are up in Figma. Would love early feedback 🙏", senderId: sarah, topicId: designTopic.id, hoursAgo: 96 },
    { content: "Looks great Sarah! The progress indicator on step 3 feels a bit heavy — maybe try a lighter style?", senderId: jordan, topicId: designTopic.id, hoursAgo: 84 },
    { content: "Agreed on the indicator. Also the CTA on step 1 could be larger — it's the primary action, make it pop 👌", senderId: ownerId, topicId: designTopic.id, hoursAgo: 72 },
    { content: "Updated screens just pushed to Figma. Bigger CTA + lighter progress indicator. Much cleaner now!", senderId: sarah, topicId: designTopic.id, hoursAgo: 48 },
    { content: "These look shipping quality 🔥 Scheduling design review for Thursday — adding to calendar now.", senderId: elena, topicId: designTopic.id, hoursAgo: 24 },
  ];

  const createdMsgs: string[] = [];
  for (const { hoursAgo, ...fields } of msgDefs) {
    const msg = await prisma.message.create({
      data: { ...fields, teamId: team.id, createdAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000) },
    });
    createdMsgs.push(msg.id);
  }

  // Reactions on messages
  if (createdMsgs.length >= 9) {
    await prisma.messageReaction.createMany({
      data: [
        { emoji: "🚀", userId: sarah, messageId: createdMsgs[0]! },
        { emoji: "🚀", userId: marcus, messageId: createdMsgs[0]! },
        { emoji: "👍", userId: ownerId, messageId: createdMsgs[5]! },
        { emoji: "💯", userId: jordan, messageId: createdMsgs[5]! },
        { emoji: "❤️", userId: marcus, messageId: createdMsgs[8]! },
        { emoji: "🔥", userId: tyler, messageId: createdMsgs[9]! },
      ],
    });
  }

  // ── DM Conversations ──────────────────────────────────────────────────────
  // Demo user <-> Sarah
  const conv1 = await prisma.conversation.create({
    data: { participants: { create: [{ userId: ownerId }, { userId: sarah }] } },
  });
  await prisma.directMessage.createMany({
    data: [
      { conversationId: conv1.id, senderId: sarah, content: "Hey! Are you free for investor prep tomorrow afternoon? Want to make sure we nail the demo.", createdAt: new Date(now.getTime() - 5 * 3600000) },
      { conversationId: conv1.id, senderId: ownerId, content: "2pm works perfectly. I'll cover metrics, can you handle the design demo?", createdAt: new Date(now.getTime() - 4.5 * 3600000) },
      { conversationId: conv1.id, senderId: sarah, content: "On it! I'll use the new onboarding screens — they'll love it 💪", createdAt: new Date(now.getTime() - 4 * 3600000) },
      { conversationId: conv1.id, senderId: ownerId, content: "Perfect. Let's do a quick run-through at 1pm?", createdAt: new Date(now.getTime() - 1 * 3600000) },
    ],
  });

  // Demo user <-> Marcus
  const conv2 = await prisma.conversation.create({
    data: { participants: { create: [{ userId: ownerId }, { userId: marcus }] } },
  });
  await prisma.directMessage.createMany({
    data: [
      { conversationId: conv2.id, senderId: marcus, content: "Found the root cause of the Android login bug — it's a token expiry edge case in the refresh logic.", createdAt: new Date(now.getTime() - 2 * 3600000) },
      { conversationId: conv2.id, senderId: ownerId, content: "Nice! What's the ETA on the fix?", createdAt: new Date(now.getTime() - 1.5 * 3600000) },
      { conversationId: conv2.id, senderId: marcus, content: "PR should be up by EOD. Can you review tomorrow morning?", createdAt: new Date(now.getTime() - 1 * 3600000) },
      { conversationId: conv2.id, senderId: ownerId, content: "Absolutely, tag me in the PR 🙌", createdAt: new Date(now.getTime() - 0.5 * 3600000) },
    ],
  });

  // Demo user <-> Jordan + Elena (group chat)
  const conv3 = await prisma.conversation.create({
    data: { isGroup: true, name: "Growth Team", participants: { create: [{ userId: ownerId }, { userId: jordan }, { userId: elena }] } },
  });
  await prisma.directMessage.createMany({
    data: [
      { conversationId: conv3.id, senderId: jordan, content: "Just wrapped up the user interview analysis. Biggest insight: users want to invite teammates faster.", createdAt: new Date(now.getTime() - 3 * 3600000) },
      { conversationId: conv3.id, senderId: elena, content: "That ties right into the referral program feature! Let's make onboarding + referral our Q2 growth bet.", createdAt: new Date(now.getTime() - 2.5 * 3600000) },
      { conversationId: conv3.id, senderId: ownerId, content: "100% aligned. I'll add it to the roadmap as a top-3 priority. Jordan, can you put together a brief?", createdAt: new Date(now.getTime() - 2 * 3600000) },
      { conversationId: conv3.id, senderId: jordan, content: "On it, will have a draft by tomorrow EOD 👍", createdAt: new Date(now.getTime() - 1.5 * 3600000) },
    ],
  });

  console.log(`[demo] Seeded demo team ${team.id} for user ${ownerId}`);
}

export { demoRouter };
