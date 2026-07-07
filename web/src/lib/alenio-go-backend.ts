import { greetingForHour } from "./alenio-go-dashboard";

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

export function goBackendGreeting(now = new Date()): string {
  return greetingForHour(now.getHours());
}

export function goBackendAdminTiles(options: {
  canManage: boolean;
  pendingCount: number;
}): GoBackendAdminTile[] {
  const { canManage, pendingCount } = options;

  return [
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
    {
      id: "checklists",
      title: "Checklists",
      subtitle: "Floor checklists module",
      tone: "cyan",
      icon: "checklists",
      active: true,
      href: "/go/checklists",
    },
    {
      id: "temp-checks",
      title: "Temp checks",
      subtitle: "Food safety temperature logs on the floor",
      tone: "emerald",
      icon: "temp",
      active: true,
      href: "/go/temp-checks",
    },
    {
      id: "briefings",
      title: "Briefings",
      subtitle: "Review & initial documents",
      tone: "amber",
      icon: "briefings",
      active: true,
      href: "/go/briefings",
    },
    {
      id: "walks",
      title: "Walks",
      subtitle: canManage
        ? "Structured manager observations with saved walk history"
        : "View completed walk records",
      tone: "violet",
      icon: "walks",
      active: true,
      href: "/go/walks",
    },
  ];
}

export function goBackendQuickActions(options: {
  inviteCode?: string | null;
  linkedDeviceCount: number;
  canManage?: boolean;
}) {
  const actions = [
    {
      id: "link",
      label: "Link a device",
      href: "/go/devices",
      tone: "indigo" as const,
      active: true,
    },
    {
      id: "code",
      label: options.inviteCode ? `Code: ${options.inviteCode}` : "Workspace code",
      tone: "emerald" as const,
      active: !!options.inviteCode,
      copyValue: options.inviteCode ?? undefined,
    },
    {
      id: "devices",
      label: `${options.linkedDeviceCount} linked`,
      href: "/go/devices",
      tone: "violet" as const,
      active: true,
    },
  ];
  return actions;
}
