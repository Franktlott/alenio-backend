import React from "react";
import { View, Text, Pressable, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import {
  ArrowLeft,
  Briefcase,
  ChevronRight,
  CreditCard,
  Shield,
  UserPlus,
  Users,
  AlertTriangle,
  Ban,
} from "lucide-react-native";
import {
  formatAdminDate,
  formatAdminRelativeTime,
  getInitials,
  isPaidPlan,
  type AdminAlert,
} from "@/lib/admin/admin-api";

export function AdminHeader({
  title,
  subtitle,
  showBackToApp = true,
}: {
  title: string;
  subtitle?: string;
  showBackToApp?: boolean;
}) {
  return (
    <>
      <StatusBar style="light" />
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <SafeAreaView edges={["top"]}>
          <View className="px-5 pt-2 pb-5">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Shield size={20} color="rgba(255,255,255,0.9)" />
                <Text className="text-white/90 text-sm font-semibold tracking-wide uppercase">Admin</Text>
              </View>
              {showBackToApp ? (
                <Pressable
                  onPress={() => router.replace("/(app)/profile")}
                  className="flex-row items-center gap-1.5 bg-white/20 rounded-xl px-3 py-1.5"
                  testID="back-to-alenio-header"
                  accessibilityRole="button"
                  accessibilityLabel="Back to Alenio"
                >
                  <ArrowLeft size={14} color="white" />
                  <Text className="text-white text-sm font-medium">Back to Alenio</Text>
                </Pressable>
              ) : (
                <View style={{ width: 72 }} />
              )}
            </View>
            <Text className="text-white text-2xl font-bold mt-3">{title}</Text>
            {subtitle ? <Text className="text-white/70 text-sm mt-0.5">{subtitle}</Text> : null}
          </View>
        </SafeAreaView>
      </LinearGradient>
    </>
  );
}

export function MetricRow({
  label,
  value,
  loading,
  isLast,
  testId,
}: {
  label: string;
  value: number;
  loading?: boolean;
  isLast?: boolean;
  testId?: string;
}) {
  return (
    <View
      testID={testId}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: "#F1F5F9",
      }}
    >
      <Text style={{ fontSize: 14, color: "#64748B", flex: 1, paddingRight: 12 }}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#4361EE" />
      ) : (
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", fontVariant: ["tabular-nums"] }}>
          {value.toLocaleString()}
        </Text>
      )}
    </View>
  );
}

export function MetricsGroup({
  title,
  rows,
  loading,
}: {
  title: string;
  rows: { label: string; value: number; testId?: string }[];
  loading?: boolean;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: "#94A3B8",
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 8,
          paddingHorizontal: 2,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          overflow: "hidden",
        }}
      >
        {rows.map((row, index) => (
          <MetricRow
            key={row.label}
            label={row.label}
            value={row.value}
            loading={loading}
            isLast={index === rows.length - 1}
            testId={row.testId}
          />
        ))}
      </View>
    </View>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  const paid = isPaidPlan(plan);
  return (
    <View className={`rounded-full px-2 py-0.5 ${paid ? "bg-emerald-100" : "bg-slate-100"}`}>
      <Text className={`text-xs font-semibold capitalize ${paid ? "text-emerald-700" : "text-slate-500"}`}>
        {paid ? plan : "Free"}
      </Text>
    </View>
  );
}

function alertVisual(type: string): { Icon: typeof UserPlus; bg: string; color: string } {
  switch (type) {
    case "workspace_created":
      return { Icon: Briefcase, bg: "bg-violet-50", color: "#7C3AED" };
    case "subscription_started":
      return { Icon: CreditCard, bg: "bg-emerald-50", color: "#059669" };
    case "subscription_canceled":
      return { Icon: Ban, bg: "bg-slate-100", color: "#64748B" };
    case "subscription_past_due":
      return { Icon: AlertTriangle, bg: "bg-amber-50", color: "#D97706" };
    case "member_joined":
      return { Icon: Users, bg: "bg-sky-50", color: "#0284C7" };
    case "user_signup":
    default:
      return { Icon: UserPlus, bg: "bg-indigo-50", color: "#4361EE" };
  }
}

export function AdminAlertRow({
  alert,
  onPress,
  isLast,
}: {
  alert: AdminAlert;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const { Icon, bg, color } = alertVisual(alert.type);
  const content = (
    <>
      <View className={`w-10 h-10 rounded-xl ${bg} items-center justify-center mr-3`}>
        <Icon size={18} color={color} />
      </View>
      <View className="flex-1 mr-2">
        <Text className="text-slate-900 text-sm font-semibold" numberOfLines={1}>
          {alert.title}
        </Text>
        {alert.subtitle ? (
          <Text className="text-slate-500 text-xs mt-0.5" numberOfLines={1}>
            {alert.subtitle}
          </Text>
        ) : null}
        <Text className="text-slate-300 text-xs mt-0.5">{formatAdminRelativeTime(alert.occurredAt)}</Text>
      </View>
      {onPress ? <ChevronRight size={16} color="#CBD5E1" /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        className={`flex-row items-center px-4 py-3 active:bg-slate-50 ${isLast ? "" : "border-b border-slate-100"}`}
        onPress={onPress}
        testID={`admin-alert-${alert.type}`}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View className={`flex-row items-center px-4 py-3 ${isLast ? "" : "border-b border-slate-100"}`}>
      {content}
    </View>
  );
}

export function AdminUserRow({
  user,
  onPress,
  trailing,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    isAdmin: boolean;
    createdAt?: string;
    subtitle?: string;
  };
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      className="flex-row items-center px-4 py-3 active:bg-slate-50"
      onPress={onPress}
      testID={`user-row-${user.id}`}
    >
      <View className="w-10 h-10 rounded-full bg-indigo-100 items-center justify-center mr-3 overflow-hidden">
        {user.image ? (
          <Image source={{ uri: user.image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
        ) : (
          <Text className="text-indigo-600 text-sm font-bold">{getInitials(user.name)}</Text>
        )}
      </View>
      <View className="flex-1 mr-2">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-slate-900 text-sm font-semibold" numberOfLines={1}>
            {user.name}
          </Text>
          {user.isAdmin ? (
            <View className="bg-indigo-100 rounded-full px-1.5 py-0.5">
              <Text className="text-indigo-600 text-xs font-semibold">Admin</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>
          {user.email}
        </Text>
        {user.subtitle ? (
          <Text className="text-slate-300 text-xs mt-0.5">{user.subtitle}</Text>
        ) : user.createdAt ? (
          <Text className="text-slate-300 text-xs mt-0.5">Joined {formatAdminDate(user.createdAt)}</Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-2">
        {trailing}
        <ChevronRight size={16} color="#CBD5E1" />
      </View>
    </Pressable>
  );
}

export function openAdminAlert(alert: AdminAlert) {
  if (alert.entityKind === "user" && alert.entityId) {
    router.push({ pathname: "/(admin)/user-detail", params: { userId: alert.entityId } });
    return;
  }
  if (alert.entityKind === "team") {
    router.push("/(admin)/(tabs)/workspaces");
  }
}
