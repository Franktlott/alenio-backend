import type { WorkspaceModule } from "./api";

/** Lifecycle-managed modules — mirrors backend MODULE_DEFINITIONS. */
export const LIFECYCLE_MODULE_KEYS = ["temp-checks", "checklists", "briefings", "walks"] as const;

export type LifecycleModuleKey = (typeof LIFECYCLE_MODULE_KEYS)[number];

export type WorkspaceModuleRowIcon =
  | "alerts"
  | "devices"
  | "checklists"
  | "briefings"
  | "walks"
  | "temp"
  | "equipment"
  | "incidents"
  | "cascades"
  | "training"
  | "recognition";

export type WorkspaceModuleRow = {
  moduleKey: string;
  moduleName: string;
  description: string;
  icon: WorkspaceModuleRowIcon;
  configureHref?: string;
  /** Lifecycle modules can be enabled via API; catalog rows are coming soon. */
  enableable: boolean;
};

/** Always-on Alenio Go infrastructure — shown under Enabled modules. */
export const INFRASTRUCTURE_MODULE_ROWS: WorkspaceModuleRow[] = [
  {
    moduleKey: "alerts",
    moduleName: "Workplace alerts",
    description: "Push alerts to floor devices",
    icon: "alerts",
    configureHref: "/go/alerts",
    enableable: false,
  },
  {
    moduleKey: "linked-devices",
    moduleName: "Linked devices",
    description: "Link tablets, approve access, and customize the floor display",
    icon: "devices",
    configureHref: "/go/devices",
    enableable: false,
  },
];

/** Catalog modules — always start in Available until built. */
export const CATALOG_MODULE_ROWS: WorkspaceModuleRow[] = [
  {
    moduleKey: "equipment-checks",
    moduleName: "Equipment checks",
    description: "Track equipment & maintenance",
    icon: "equipment",
    enableable: false,
  },
  {
    moduleKey: "incident-reports",
    moduleName: "Incident reports",
    description: "Report and manage incidents",
    icon: "incidents",
    enableable: false,
  },
  {
    moduleKey: "cascades",
    moduleName: "Cascades",
    description: "Broadcast messages and updates",
    icon: "cascades",
    enableable: false,
  },
  {
    moduleKey: "training",
    moduleName: "Training",
    description: "Training content & assignments",
    icon: "training",
    enableable: false,
  },
  {
    moduleKey: "recognition",
    moduleName: "Recognition",
    description: "Peer recognition & shoutouts",
    icon: "recognition",
    enableable: false,
  },
];

const EMPTY_TESTING_ACCESS: WorkspaceModule["testingAccess"] = {
  requireTestCode: false,
  testAccessCode: null,
  testCodeExpiresAt: null,
  allowedTestingWorkplaceIds: [],
  allowedTestingUserIds: [],
  allowedTestingRoles: [],
};

export function isLifecycleModuleKey(id: string): id is LifecycleModuleKey {
  return (LIFECYCLE_MODULE_KEYS as readonly string[]).includes(id);
}

function lifecycleRowFromModule(mod: WorkspaceModule): WorkspaceModuleRow {
  const iconMap: Record<LifecycleModuleKey, WorkspaceModuleRowIcon> = {
    "temp-checks": "temp",
    checklists: "checklists",
    briefings: "briefings",
    walks: "walks",
  };
  return {
    moduleKey: mod.moduleKey,
    moduleName: mod.moduleKey === "temp-checks" ? "Temp checks" : mod.moduleName,
    description: mod.description,
    icon: iconMap[mod.moduleKey as LifecycleModuleKey] ?? "checklists",
    configureHref: mod.baseHref,
    enableable: true,
  };
}

/** Default inactive lifecycle modules (Available until enabled). */
export function defaultWorkspaceModules(): WorkspaceModule[] {
  return [
    {
      moduleKey: "temp-checks",
      moduleName: "Temperature Checks",
      description: "Configure temps in Go; associates take checks in the Alenio Temps app.",
      icon: "temp",
      tone: "emerald",
      baseHref: "/go/temp-checks/library",
      status: "inactive",
      operatingMode: null,
      setupProgressPercent: 0,
      setupCompletedAt: null,
      activatedAt: null,
      liveStartedAt: null,
      testingStartedAt: null,
      testingAccess: { ...EMPTY_TESTING_ACCESS },
      updatedAt: new Date(0).toISOString(),
    },
    {
      moduleKey: "checklists",
      moduleName: "Checklists",
      description: "Floor checklists module.",
      icon: "checklists",
      tone: "cyan",
      baseHref: "/go/checklists",
      status: "inactive",
      operatingMode: null,
      setupProgressPercent: 0,
      setupCompletedAt: null,
      activatedAt: null,
      liveStartedAt: null,
      testingStartedAt: null,
      testingAccess: { ...EMPTY_TESTING_ACCESS },
      updatedAt: new Date(0).toISOString(),
    },
    {
      moduleKey: "briefings",
      moduleName: "Briefings",
      description: "Review & initial documents.",
      icon: "briefings",
      tone: "amber",
      baseHref: "/go/briefings",
      status: "inactive",
      operatingMode: null,
      setupProgressPercent: 0,
      setupCompletedAt: null,
      activatedAt: null,
      liveStartedAt: null,
      testingStartedAt: null,
      testingAccess: { ...EMPTY_TESTING_ACCESS },
      updatedAt: new Date(0).toISOString(),
    },
    {
      moduleKey: "walks",
      moduleName: "Walks",
      description: "Structured manager observations with saved walk history.",
      icon: "walks",
      tone: "violet",
      baseHref: "/go/walks",
      status: "inactive",
      operatingMode: null,
      setupProgressPercent: 0,
      setupCompletedAt: null,
      activatedAt: null,
      liveStartedAt: null,
      testingStartedAt: null,
      testingAccess: { ...EMPTY_TESTING_ACCESS },
      updatedAt: new Date(0).toISOString(),
    },
  ];
}

export function defaultModulesByKey(): Record<string, WorkspaceModule> {
  return Object.fromEntries(defaultWorkspaceModules().map((m) => [m.moduleKey, m]));
}

export function mergeWorkspaceModules(apiModules: WorkspaceModule[]): Record<string, WorkspaceModule> {
  const merged = defaultModulesByKey();
  for (const mod of apiModules) {
    if (isLifecycleModuleKey(mod.moduleKey)) {
      merged[mod.moduleKey] = mod;
    }
  }
  return merged;
}

export function splitWorkspaceModuleLists(modulesByKey: Record<string, WorkspaceModule>): {
  enabled: WorkspaceModuleRow[];
  available: WorkspaceModuleRow[];
} {
  const enabled: WorkspaceModuleRow[] = [...INFRASTRUCTURE_MODULE_ROWS];
  const available: WorkspaceModuleRow[] = [];

  for (const key of LIFECYCLE_MODULE_KEYS) {
    const mod = modulesByKey[key] ?? defaultModulesByKey()[key];
    if (mod.status === "active") {
      enabled.push(lifecycleRowFromModule(mod));
    } else {
      available.push(lifecycleRowFromModule(mod));
    }
  }

  available.push(...CATALOG_MODULE_ROWS);
  return { enabled, available };
}
