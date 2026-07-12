import { useQuery } from "@tanstack/react-query";
import { fetch } from "expo/fetch";
import { readJsonSafe } from "@/lib/api/api";
import { getAuthHeaders } from "@/lib/auth/auth-client";
import { getBackendUrl } from "@/lib/backend-url";

const BASE_URL = getBackendUrl();

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  isAdmin: boolean;
  _count: { teamMembers: number };
};

export type RecentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  isAdmin: boolean;
};

export type AdminAlertType =
  | "user_signup"
  | "workspace_created"
  | "subscription_started"
  | "subscription_canceled"
  | "subscription_past_due"
  | "member_joined";

export type AdminAlert = {
  id: string;
  type: AdminAlertType | string;
  title: string;
  subtitle: string | null;
  occurredAt: string;
  entityId: string | null;
  entityKind: "user" | "team" | "subscription" | null;
};

export type AdminUsageMetricKey =
  | "users"
  | "workspaces"
  | "checkIns"
  | "messages"
  | "tasks";

export type AdminUsageWeekPoint = {
  weekStart: string;
  label: string;
  users: number;
  workspaces: number;
  checkIns: number;
  messages: number;
  tasks: number;
};

export type AdminWeeklyUsage = {
  weeks: AdminUsageWeekPoint[];
  metrics: { key: AdminUsageMetricKey; label: string }[];
};

export type AdminStats = {
  users: number;
  teams: number;
  tasks: number;
  messages: number;
  activeSubscriptions: number;
  usersThisWeek: number;
  teamsThisWeek: number;
  checkIns: number;
  checkInsThisWeek: number;
  developmentGoals: number;
  activeGoals: number;
  weeklyUsage?: AdminWeeklyUsage;
  recentUsers: RecentUser[];
  recentAlerts?: AdminAlert[];
};

export type AdminTeam = {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  memberCount: number;
  taskCount: number;
  owner: { id: string; name: string; email: string } | null;
  subscription: {
    plan: string;
    status: string;
    stripeCustomerId: string | null;
    currentPeriodEnd: string | null;
  };
};

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${BASE_URL}/api/admin-mobile/stats`, {
        credentials: "include",
        headers: authHeaders,
      });
      const json = await readJsonSafe<{ data: AdminStats; error?: { message: string } }>(res);
      if (!res.ok) throw new Error(json?.error?.message || "Request failed");
      return json?.data as AdminStats;
    },
  });
}

export function useAdminUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${BASE_URL}/api/admin-mobile/users`, {
        credentials: "include",
        headers: authHeaders,
      });
      const json = await readJsonSafe<{ data: AdminUser[]; error?: { message: string } }>(res);
      if (!res.ok) throw new Error(json?.error?.message || "Request failed");
      return json?.data as AdminUser[];
    },
  });
}

export function useAdminTeams() {
  return useQuery<AdminTeam[]>({
    queryKey: ["admin", "teams"],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${BASE_URL}/api/admin-mobile/teams`, {
        credentials: "include",
        headers: authHeaders,
      });
      const json = await readJsonSafe<{ data: AdminTeam[]; error?: { message: string } }>(res);
      if (!res.ok) throw new Error(json?.error?.message || "Request failed");
      return json?.data as AdminTeam[];
    },
  });
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatAdminDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatAdminRelativeTime(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatAdminDate(dateStr);
}

export function isPaidPlan(plan: string) {
  return plan !== "free";
}

export { BASE_URL as ADMIN_API_BASE_URL };
