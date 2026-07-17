import type { WorkspaceModule } from "./api";
import { greetingForHour } from "./alenio-go-dashboard";
import { LIFECYCLE_MODULE_KEYS, isLifecycleModuleKey } from "./workspace-modules";

export type GoBackendAdminTile = {
  id: string;
  title: string;
  subtitle: string;
  tone: "indigo" | "cyan" | "violet" | "amber" | "emerald";
  icon: "alerts" | "devices" | "checklists" | "briefings" | "walks" | "temp";
  active: boolean;
  href?: string;
  badge?: number;
};

const TILE_TONES = ["indigo", "cyan", "violet", "amber", "emerald"] as const;

function tileTone(value: string | undefined): GoBackendAdminTile["tone"] {
  return (TILE_TONES as readonly string[]).includes(value ?? "")
    ? (value as GoBackendAdminTile["tone"])
    : "indigo";
}

function tileIcon(moduleKey: string, icon: string | undefined): GoBackendAdminTile["icon"] {
  if (moduleKey === "temp-checks" || icon === "temp") return "temp";
  if (moduleKey === "checklists" || icon === "checklists") return "checklists";
  if (moduleKey === "briefings" || icon === "briefings") return "briefings";
  if (moduleKey === "walks" || icon === "walks") return "walks";
  return "checklists";
}

function tileTitle(mod: WorkspaceModule): string {
  if (mod.moduleKey === "temp-checks") return "Temp checks";
  return mod.moduleName;
}

export function goBackendGreeting(now = new Date()): string {
  return greetingForHour(now.getHours());
}

export function goBackendAdminTiles(options: {
  canManage: boolean;
  pendingCount: number;
  modulesByKey?: Record<string, WorkspaceModule>;
}): GoBackendAdminTile[] {
  const { canManage, pendingCount, modulesByKey = {} } = options;

  const tiles: GoBackendAdminTile[] = [
    {
      id: "alerts",
      title: "Workplace alerts",
      subtitle: canManage ? "Push alerts to floor devices" : "Owner or leader access",
      tone: "indigo",
      icon: "alerts",
      active: canManage,
      href: canManage ? "/go/alerts" : undefined,
    },
    {
      id: "linked-devices",
      title: "Linked devices",
      subtitle: canManage
        ? "Link tablets, approve access, and customize the floor display"
        : "Link and manage floor tablets",
      tone: "violet",
      icon: "devices",
      active: true,
      href: "/go/devices",
      badge: canManage && pendingCount > 0 ? pendingCount : undefined,
    },
  ];

  for (const key of LIFECYCLE_MODULE_KEYS) {
    const mod = modulesByKey[key];
    if (!mod || mod.status !== "active" || !isLifecycleModuleKey(mod.moduleKey)) continue;
    tiles.push({
      id: mod.moduleKey,
      title: tileTitle(mod),
      subtitle: mod.description,
      tone: tileTone(mod.tone),
      icon: tileIcon(mod.moduleKey, mod.icon),
      active: true,
      href: mod.baseHref || `/go/${mod.moduleKey}`,
    });
  }

  return tiles;
}

export type GoBackendQuickAction = {
  id: string;
  label: string;
  tone: "indigo" | "emerald" | "violet" | "amber" | "slate";
  active: boolean;
  href?: string;
  copyValue?: string;
  /** Opens the manage-device-quick-actions panel instead of navigating. */
  manageDeviceActions?: boolean;
};

export function goBackendQuickActions(options: {
  inviteCode?: string | null;
  linkedDeviceCount: number;
  canManage?: boolean;
}): GoBackendQuickAction[] {
  const actions: GoBackendQuickAction[] = [
    {
      id: "link",
      label: "Link a device",
      href: "/go/devices",
      tone: "indigo",
      active: true,
    },
    {
      id: "code",
      label: options.inviteCode ? `Code: ${options.inviteCode}` : "Workspace code",
      tone: "emerald",
      active: !!options.inviteCode,
      copyValue: options.inviteCode ?? undefined,
    },
    {
      id: "devices",
      label: `${options.linkedDeviceCount} linked`,
      href: "/go/devices",
      tone: "violet",
      active: true,
    },
  ];

  if (options.canManage) {
    actions.push({
      id: "manage-device-actions",
      label: "Manage device actions",
      tone: "amber",
      active: true,
      manageDeviceActions: true,
    });
  }

  return actions;
}
