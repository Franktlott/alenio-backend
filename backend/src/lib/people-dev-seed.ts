import { buildDmPairKey } from "./dm-pair-key";

export const PEOPLE_DEV_SEED_PREFIX = "seed-people-";
export const PEOPLE_DEV_ORGANIZATION_ID = `${PEOPLE_DEV_SEED_PREFIX}organization`;
export const PEOPLE_DEV_ORGANIZATION_SLUG = "seed-people-development";
export const PEOPLE_DEV_WORKSPACES = [
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}workspace-northstar`,
    name: "People Dev · Northstar",
    inviteCode: "PDNORTH1",
    location: "Austin, TX",
    organizationId: PEOPLE_DEV_ORGANIZATION_ID,
    memberPersonIds: [
      `${PEOPLE_DEV_SEED_PREFIX}accepted-maya`,
      `${PEOPLE_DEV_SEED_PREFIX}accepted-jordan`,
      `${PEOPLE_DEV_SEED_PREFIX}accepted-priya`,
      `${PEOPLE_DEV_SEED_PREFIX}accepted-luis`,
      `${PEOPLE_DEV_SEED_PREFIX}suggestion-aisha`,
      `${PEOPLE_DEV_SEED_PREFIX}suggestion-grace`,
      `${PEOPLE_DEV_SEED_PREFIX}suggestion-marcus`,
      `${PEOPLE_DEV_SEED_PREFIX}suggestion-owen`,
    ],
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}workspace-fieldstone`,
    name: "People Dev · Fieldstone",
    inviteCode: "PDFIELD1",
    location: "Denver, CO",
    organizationId: null,
    memberPersonIds: [
      `${PEOPLE_DEV_SEED_PREFIX}accepted-jordan`,
      `${PEOPLE_DEV_SEED_PREFIX}suggestion-ethan`,
      `${PEOPLE_DEV_SEED_PREFIX}suggestion-hana`,
    ],
  },
] as const;

export const PEOPLE_DEV_HOME_ACTIVITIES = [
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}home-recognition`,
    workspaceId: `${PEOPLE_DEV_SEED_PREFIX}workspace-northstar`,
    actorPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-maya`,
    target: "viewer",
    type: "celebration",
    minutesAgo: 20,
    metadata: { message: "Your thoughtful coaching made a real difference this week." },
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}home-goal-completed`,
    workspaceId: `${PEOPLE_DEV_SEED_PREFIX}workspace-northstar`,
    actorPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-jordan`,
    target: "actor",
    type: "development_goal_completed",
    minutesAgo: 50,
    metadata: {},
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}home-task-milestone`,
    workspaceId: `${PEOPLE_DEV_SEED_PREFIX}workspace-northstar`,
    actorPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-luis`,
    target: null,
    type: "task_milestone",
    minutesAgo: 90,
    metadata: { count: 10 },
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}home-member-joined`,
    workspaceId: `${PEOPLE_DEV_SEED_PREFIX}workspace-fieldstone`,
    actorPersonId: `${PEOPLE_DEV_SEED_PREFIX}suggestion-ethan`,
    target: null,
    type: "member_joined",
    minutesAgo: 180,
    metadata: {},
  },
] as const;

export const PEOPLE_DEV_MODES = ["seed", "presence", "cleanup", "dry-run"] as const;
export type PeopleDevMode = (typeof PEOPLE_DEV_MODES)[number];

export type PeopleDevCliOptions = {
  mode: PeopleDevMode;
  viewer: string;
  confirmDev: boolean;
};

export type PeopleDevPerson = {
  id: string;
  kind: "accepted" | "suggestion" | "pending";
  name: string;
  username: string;
  email: string;
  image: string;
  profileTitle: string;
  profileOrganization: string;
  profileLocation: string;
  active: boolean;
};

const image = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=256&h=256&q=80`;

export const PEOPLE_DEV_PEOPLE = [
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}accepted-maya`,
    kind: "accepted",
    name: "Maya Chen",
    username: "maya.seed",
    email: "maya.seed@people-dev.invalid",
    image: image("photo-1494790108377-be9c29b29330"),
    profileTitle: "Learning & Development Lead",
    profileOrganization: "Northstar Hospitality",
    profileLocation: "Austin, TX",
    active: true,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}accepted-jordan`,
    kind: "accepted",
    name: "Jordan Brooks",
    username: "jordan.seed",
    email: "jordan.seed@people-dev.invalid",
    image: image("photo-1500648767791-00dcc994a43e"),
    profileTitle: "Operations Coach",
    profileOrganization: "Fieldstone Foods",
    profileLocation: "Denver, CO",
    active: true,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}accepted-priya`,
    kind: "accepted",
    name: "Priya Shah",
    username: "priya.seed",
    email: "priya.seed@people-dev.invalid",
    image: image("photo-1534528741775-53994a69daeb"),
    profileTitle: "People Experience Manager",
    profileOrganization: "Juniper Kitchens",
    profileLocation: "Chicago, IL",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}accepted-luis`,
    kind: "accepted",
    name: "Luis Martinez",
    username: "luis.seed",
    email: "luis.seed@people-dev.invalid",
    image: image("photo-1507003211169-0a1dd7228f2d"),
    profileTitle: "Regional Training Manager",
    profileOrganization: "Beacon Dining Group",
    profileLocation: "Miami, FL",
    active: true,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}suggestion-aisha`,
    kind: "suggestion",
    name: "Aisha Thompson",
    username: "aisha.seed",
    email: "aisha.seed@people-dev.invalid",
    image: image("photo-1531123897727-8f129e1688ce"),
    profileTitle: "Talent Development Partner",
    profileOrganization: "Northstar Hospitality",
    profileLocation: "Nashville, TN",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}suggestion-ethan`,
    kind: "suggestion",
    name: "Ethan Park",
    username: "ethan.seed",
    email: "ethan.seed@people-dev.invalid",
    image: image("photo-1506794778202-cad84cf45f1d"),
    profileTitle: "District Operations Leader",
    profileOrganization: "Fieldstone Foods",
    profileLocation: "Seattle, WA",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}suggestion-sofia`,
    kind: "suggestion",
    name: "Sofia Ramirez",
    username: "sofia.seed",
    email: "sofia.seed@people-dev.invalid",
    image: image("photo-1544005313-94ddf0286df2"),
    profileTitle: "Leadership Programs Director",
    profileOrganization: "People Development Collective",
    profileLocation: "San Diego, CA",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}suggestion-grace`,
    kind: "suggestion",
    name: "Grace Nakamura",
    username: "grace.seed",
    email: "grace.seed@people-dev.invalid",
    image: image("photo-1573496359142-b8d87734a5a2"),
    profileTitle: "Front of House Director",
    profileOrganization: "Northstar Hospitality",
    profileLocation: "Austin, TX",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}suggestion-marcus`,
    kind: "suggestion",
    name: "Marcus Bell",
    username: "marcus.seed",
    email: "marcus.seed@people-dev.invalid",
    image: image("photo-1472099645785-5658abf4ff4e"),
    profileTitle: "Culinary Training Lead",
    profileOrganization: "Northstar Hospitality",
    profileLocation: "Houston, TX",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}suggestion-hana`,
    kind: "suggestion",
    name: "Hana Yusuf",
    username: "hana.seed",
    email: "hana.seed@people-dev.invalid",
    image: image("photo-1580489944761-15a19d654956"),
    profileTitle: "Store Operations Manager",
    profileOrganization: "Fieldstone Foods",
    profileLocation: "Boulder, CO",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}suggestion-owen`,
    kind: "suggestion",
    name: "Owen Reyes",
    username: "owen.seed",
    email: "owen.seed@people-dev.invalid",
    image: image("photo-1519345182560-3f2917c472ef"),
    profileTitle: "Shift Lead",
    profileOrganization: "Northstar Hospitality",
    profileLocation: "San Antonio, TX",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}suggestion-lila`,
    kind: "suggestion",
    name: "Lila Fontaine",
    username: "lila.seed",
    email: "lila.seed@people-dev.invalid",
    image: image("photo-1502378735452-bc7d86632805"),
    profileTitle: "Hospitality Program Manager",
    profileOrganization: "People Development Collective",
    profileLocation: "New Orleans, LA",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}pending-incoming-noah`,
    kind: "pending",
    name: "Noah Williams",
    username: "noah.seed",
    email: "noah.seed@people-dev.invalid",
    image: image("photo-1507591064344-4c6ce005b128"),
    profileTitle: "Restaurant General Manager",
    profileOrganization: "Willow & Pine",
    profileLocation: "Portland, OR",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}pending-incoming-amara`,
    kind: "pending",
    name: "Amara Cole",
    username: "amara.seed",
    email: "amara.seed@people-dev.invalid",
    image: image("photo-1487412720507-e7ab37603c6f"),
    profileTitle: "Shift Supervisor",
    profileOrganization: "Willow & Pine",
    profileLocation: "Sacramento, CA",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}pending-incoming-dev`,
    kind: "pending",
    name: "Dev Patel",
    username: "dev.seed",
    email: "dev.seed@people-dev.invalid",
    image: image("photo-1519085360753-af0119f7cbe7"),
    profileTitle: "Kitchen Operations Manager",
    profileOrganization: "Juniper Kitchens",
    profileLocation: "Phoenix, AZ",
    active: false,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}pending-outgoing-elena`,
    kind: "pending",
    name: "Elena Rossi",
    username: "elena.seed",
    email: "elena.seed@people-dev.invalid",
    image: image("photo-1524504388940-b1c1722653e1"),
    profileTitle: "Training Operations Specialist",
    profileOrganization: "Harbor Hospitality",
    profileLocation: "Boston, MA",
    active: false,
  },
] as const satisfies readonly PeopleDevPerson[];

export const PEOPLE_DEV_ACCEPTED = PEOPLE_DEV_PEOPLE.filter(
  (person) => person.kind === "accepted",
);
export const PEOPLE_DEV_SUGGESTIONS = PEOPLE_DEV_PEOPLE.filter(
  (person) => person.kind === "suggestion",
);
export const PEOPLE_DEV_PENDING = PEOPLE_DEV_PEOPLE.filter(
  (person) => person.kind === "pending",
);
export const PEOPLE_DEV_ACTIVE_IDS = PEOPLE_DEV_ACCEPTED.filter((person) => person.active).map(
  (person) => person.id,
);

export const PEOPLE_DEV_ACCEPTED_CONNECTIONS = PEOPLE_DEV_ACCEPTED.map((person, index) => ({
  id: `${PEOPLE_DEV_SEED_PREFIX}connection-accepted-${index + 1}`,
  personId: person.id,
  acceptedDaysAgo: [2, 8, 21, 45][index]!,
}));

export const PEOPLE_DEV_PENDING_CONNECTIONS = [
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-pending-incoming`,
    direction: "incoming",
    personId: `${PEOPLE_DEV_SEED_PREFIX}pending-incoming-noah`,
    hoursAgo: 6,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-pending-incoming-amara`,
    direction: "incoming",
    personId: `${PEOPLE_DEV_SEED_PREFIX}pending-incoming-amara`,
    hoursAgo: 27,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-pending-incoming-dev`,
    direction: "incoming",
    personId: `${PEOPLE_DEV_SEED_PREFIX}pending-incoming-dev`,
    hoursAgo: 75,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-pending-outgoing`,
    direction: "outgoing",
    personId: `${PEOPLE_DEV_SEED_PREFIX}pending-outgoing-elena`,
    hoursAgo: 2,
  },
] as const;

export const PEOPLE_DEV_MUTUAL_BRIDGES = [
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-bridge-aisha`,
    acceptedPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-maya`,
    suggestionPersonId: `${PEOPLE_DEV_SEED_PREFIX}suggestion-aisha`,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-bridge-ethan`,
    acceptedPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-jordan`,
    suggestionPersonId: `${PEOPLE_DEV_SEED_PREFIX}suggestion-ethan`,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-bridge-grace`,
    acceptedPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-maya`,
    suggestionPersonId: `${PEOPLE_DEV_SEED_PREFIX}suggestion-grace`,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-bridge-marcus`,
    acceptedPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-priya`,
    suggestionPersonId: `${PEOPLE_DEV_SEED_PREFIX}suggestion-marcus`,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-bridge-marcus-luis`,
    acceptedPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-luis`,
    suggestionPersonId: `${PEOPLE_DEV_SEED_PREFIX}suggestion-marcus`,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-bridge-hana`,
    acceptedPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-jordan`,
    suggestionPersonId: `${PEOPLE_DEV_SEED_PREFIX}suggestion-hana`,
  },
  {
    id: `${PEOPLE_DEV_SEED_PREFIX}connection-bridge-lila`,
    acceptedPersonId: `${PEOPLE_DEV_SEED_PREFIX}accepted-maya`,
    suggestionPersonId: `${PEOPLE_DEV_SEED_PREFIX}suggestion-lila`,
  },
] as const;

/** Suggestions that surface through the shared organization rather than a workspace. */
export const PEOPLE_DEV_ORGANIZATION_PERSON_IDS = [
  `${PEOPLE_DEV_SEED_PREFIX}suggestion-sofia`,
  `${PEOPLE_DEV_SEED_PREFIX}suggestion-lila`,
] as const;

export const PEOPLE_DEV_CONVERSATIONS = PEOPLE_DEV_ACCEPTED.map((person, index) => ({
  id: `${PEOPLE_DEV_SEED_PREFIX}conversation-${index + 1}`,
  personId: person.id,
  messages: [
    {
      id: `${PEOPLE_DEV_SEED_PREFIX}message-${index + 1}-1`,
      sender: index % 2 === 0 ? ("viewer" as const) : ("person" as const),
      daysAgo: [1, 3, 9, 18][index]!,
      content: [
        "The coaching conversation went really well—thanks for the framework.",
        "I shared the development plan with my leadership team.",
        "Can we compare notes on the next mentoring session?",
        "That feedback prompt helped us get to a clear next step.",
      ][index]!,
    },
    ...(index < 2
      ? [
          {
            id: `${PEOPLE_DEV_SEED_PREFIX}message-${index + 1}-2`,
            sender: index % 2 === 0 ? ("person" as const) : ("viewer" as const),
            daysAgo: [0.25, 2][index]!,
            content: [
              "Absolutely. I added a follow-up goal for next week.",
              "Great—let's revisit progress after the next shift.",
            ][index]!,
          },
        ]
      : []),
  ],
}));

export function buildPeopleDevConnectionPairKey(userIdA: string, userIdB: string): string {
  return buildDmPairKey(userIdA, userIdB);
}

export function parsePeopleDevArgs(argv: string[]): PeopleDevCliOptions {
  let mode: PeopleDevMode = "seed";
  let viewer = "";
  let confirmDev = false;
  let positionalModeSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--") continue;
    if (argument === "--viewer") {
      viewer = argv[index + 1]?.trim() ?? "";
      index += 1;
      continue;
    }
    if (argument === "--confirm-dev") {
      confirmDev = true;
      continue;
    }
    if (argument === "--mode") {
      const value = argv[index + 1]?.trim() ?? "";
      if (!isPeopleDevMode(value)) throw new Error(`Invalid People seed mode: ${value || "(missing)"}`);
      mode = value;
      positionalModeSeen = true;
      index += 1;
      continue;
    }
    if (!argument.startsWith("-") && !positionalModeSeen && isPeopleDevMode(argument)) {
      mode = argument;
      positionalModeSeen = true;
      continue;
    }
    throw new Error(`Unknown People seed argument: ${argument}`);
  }

  if (!viewer) throw new Error("--viewer <email|username|id> is required");
  if (mode !== "dry-run" && !confirmDev) {
    throw new Error(`--confirm-dev is required for mutating mode "${mode}"`);
  }

  return { mode, viewer, confirmDev };
}

export function assertSafePeopleDevEnvironment(
  options: PeopleDevCliOptions,
  environment: Record<string, string | undefined>,
): void {
  if (options.mode === "dry-run") return;

  const nodeEnvironment = normalized(environment.NODE_ENV);
  const apiTarget = normalized(environment.VITE_API_TARGET);
  const railwayEnvironment = normalized(
    environment.RAILWAY_ENVIRONMENT_NAME ?? environment.RAILWAY_ENVIRONMENT,
  );
  if (nodeEnvironment === "production" || nodeEnvironment === "prod") {
    throw new Error("Refusing People seed mutation: NODE_ENV is production");
  }
  if (apiTarget === "production" || apiTarget === "prod") {
    throw new Error("Refusing People seed mutation: VITE_API_TARGET is production");
  }
  if (railwayEnvironment === "production" || railwayEnvironment === "prod") {
    throw new Error("Refusing People seed mutation: Railway environment is production");
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Refusing People seed mutation: DATABASE_URL is missing");
  const parsed = parsePostgresDatabaseUrl(databaseUrl);
  const productionUrl = environment.PROD_DATABASE_URL?.trim();
  if (productionUrl && normalizeDatabaseUrl(databaseUrl) === normalizeDatabaseUrl(productionUrl)) {
    throw new Error("Refusing People seed mutation: DATABASE_URL equals PROD_DATABASE_URL");
  }
  if (!parsed.database) {
    throw new Error("Refusing People seed mutation: DATABASE_URL has no database name");
  }
}

export function describePeopleDevDatabase(databaseUrl: string): {
  host: string;
  database: string;
} {
  const parsed = parsePostgresDatabaseUrl(databaseUrl);
  return { host: parsed.host, database: parsed.database };
}

export function buildPeopleDevCleanupSelectors(viewerId: string) {
  const directConnections = PEOPLE_DEV_PEOPLE.map((person) => person.id);
  return {
    userIds: PEOPLE_DEV_PEOPLE.map((person) => person.id),
    conversationIds: PEOPLE_DEV_CONVERSATIONS.map((conversation) => conversation.id),
    dmPairKeys: PEOPLE_DEV_ACCEPTED.map((person) => buildDmPairKey(viewerId, person.id)),
    connectionIds: [
      ...PEOPLE_DEV_ACCEPTED_CONNECTIONS.map((connection) => connection.id),
      ...PEOPLE_DEV_PENDING_CONNECTIONS.map((connection) => connection.id),
      ...PEOPLE_DEV_MUTUAL_BRIDGES.map((connection) => connection.id),
    ],
    connectionPairKeys: [
      ...directConnections.map((personId) => buildPeopleDevConnectionPairKey(viewerId, personId)),
      ...PEOPLE_DEV_MUTUAL_BRIDGES.map((connection) =>
        buildPeopleDevConnectionPairKey(
          connection.acceptedPersonId,
          connection.suggestionPersonId,
        ),
      ),
    ],
    organizationIds: [PEOPLE_DEV_ORGANIZATION_ID],
    teamIds: PEOPLE_DEV_WORKSPACES.map((workspace) => workspace.id),
    activityIds: PEOPLE_DEV_HOME_ACTIVITIES.map((activity) => activity.id),
  };
}

export function getPeopleDevFixtureSummary() {
  return {
    people: PEOPLE_DEV_PEOPLE.length,
    acceptedConnections: PEOPLE_DEV_ACCEPTED.length,
    activeConnections: PEOPLE_DEV_ACTIVE_IDS.length,
    suggestions: PEOPLE_DEV_SUGGESTIONS.length,
    pendingRequests: PEOPLE_DEV_PENDING_CONNECTIONS.length,
    conversations: PEOPLE_DEV_CONVERSATIONS.length,
    messages: PEOPLE_DEV_CONVERSATIONS.reduce(
      (total, conversation) => total + conversation.messages.length,
      0,
    ),
    workspaces: PEOPLE_DEV_WORKSPACES.length,
    homeActivities: PEOPLE_DEV_HOME_ACTIVITIES.length,
    teamMembers:
      PEOPLE_DEV_WORKSPACES.length +
      PEOPLE_DEV_WORKSPACES.reduce(
        (total, workspace) => total + workspace.memberPersonIds.length,
        0,
      ),
  };
}

function isPeopleDevMode(value: string): value is PeopleDevMode {
  return (PEOPLE_DEV_MODES as readonly string[]).includes(value);
}

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function parsePostgresDatabaseUrl(databaseUrl: string): {
  host: string;
  database: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Refusing People seed mutation: DATABASE_URL is invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Refusing People seed mutation: DATABASE_URL must use PostgreSQL");
  }
  if (!parsed.hostname) {
    throw new Error("Refusing People seed mutation: DATABASE_URL has no host");
  }
  return {
    host: parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname,
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? ""),
  };
}

function normalizeDatabaseUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return databaseUrl.trim().replace(/\/+$/, "");
  }
}
