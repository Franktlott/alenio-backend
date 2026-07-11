import React from "react";
import { View, Text, Pressable, Platform, Switch, ActivityIndicator } from "react-native";
import * as Notifications from "expo-notifications";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Volume2,
  MessageSquare,
  ClipboardList,
  Calendar,
  Video,
  Users,
  Building2,
  CreditCard,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { ensureAndroidChannelsForPreview, notificationPreviewDataKey } from "@/lib/notifications";

export type NotifPrefs = {
  isAdmin?: boolean;
  notifMessages: boolean;
  notifTaskAssigned: boolean;
  notifTaskDue: boolean;
  notifMeetings: boolean;
  notifAdminUsers?: boolean;
  notifAdminWorkspaces?: boolean;
  notifAdminBilling?: boolean;
  notifTone: string;
  hasToken: boolean;
};

type AlertCategoryKey =
  | "notifMessages"
  | "notifTaskAssigned"
  | "notifTaskDue"
  | "notifMeetings"
  | "notifAdminUsers"
  | "notifAdminWorkspaces"
  | "notifAdminBilling";

type AlertCategory = {
  key: AlertCategoryKey;
  label: string;
  description: string;
  Icon: LucideIcon;
  admin?: boolean;
};

export const NOTIFICATION_TONES = [
  { value: "default", label: "Default", description: "Platform standard alert" },
  { value: "bell", label: "Bell", description: "Single clear tone" },
  { value: "chime", label: "Chime", description: "Soft, unobtrusive" },
  { value: "alert", label: "Alert", description: "High-attention signal" },
  { value: "silent", label: "Silent", description: "Visual only, no audio" },
] as const;

const WORKSPACE_ALERT_CATEGORIES: AlertCategory[] = [
  { key: "notifMessages", label: "Messages", description: "Channels and DMs", Icon: MessageSquare },
  { key: "notifTaskAssigned", label: "Task assignments", description: "Work assigned to you", Icon: ClipboardList },
  { key: "notifTaskDue", label: "Due date reminders", description: "Deadlines and overdue items", Icon: Calendar },
  { key: "notifMeetings", label: "Meetings", description: "Starts and reminders", Icon: Video },
];

const ADMIN_ALERT_CATEGORIES: AlertCategory[] = [
  {
    key: "notifAdminUsers",
    label: "Users & signups",
    description: "New accounts and joins",
    Icon: Users,
    admin: true,
  },
  {
    key: "notifAdminWorkspaces",
    label: "New workplaces",
    description: "Workplace created",
    Icon: Building2,
    admin: true,
  },
  {
    key: "notifAdminBilling",
    label: "Billing & plans",
    description: "Subscriptions and past due",
    Icon: CreditCard,
    admin: true,
  },
];

export function notificationToneLabel(tone: string | undefined): string {
  const t = tone ?? "default";
  const match = NOTIFICATION_TONES.find((o) => o.value === t);
  if (match) return match.label;
  if (!["bell", "chime", "alert", "silent"].includes(t)) return "Default";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function notificationPreferencesSummary(prefs: NotifPrefs | undefined): string {
  if (!prefs) return "Manage alerts and delivery";
  const flags = [prefs.notifMessages, prefs.notifTaskAssigned, prefs.notifTaskDue, prefs.notifMeetings];
  if (prefs.isAdmin) {
    flags.push(
      prefs.notifAdminUsers ?? true,
      prefs.notifAdminWorkspaces ?? true,
      prefs.notifAdminBilling ?? true,
    );
  }
  const enabled = flags.filter(Boolean).length;
  const tone = notificationToneLabel(prefs.notifTone);
  if (enabled === 0) return `All categories off · ${tone}`;
  if (enabled === flags.length) return `All categories on · ${tone}`;
  return `${enabled} of ${flags.length} categories · ${tone}`;
}

const C = {
  ink: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  line: "#E2E8F0",
  lineSoft: "#F1F5F9",
  surface: "#FFFFFF",
  navy: "#1E3A8A",
  navySoft: "#EFF6FF",
  slateSoft: "#F8FAFC",
};

const UI = {
  card: {
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    overflow: "hidden" as const,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 0.8,
    color: C.muted,
    textTransform: "uppercase" as const,
  },
  rowTitle: { fontSize: 14, fontWeight: "600" as const, color: C.ink },
  rowDesc: { fontSize: 12, color: C.muted, marginTop: 1, lineHeight: 15 },
  divider: { height: 1, backgroundColor: C.lineSoft, marginLeft: 44 },
};

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={{ marginBottom: 6, paddingHorizontal: 2 }}>
      <Text style={UI.sectionLabel}>{title}</Text>
    </View>
  );
}

function AdminBadge() {
  return (
    <View
      style={{
        marginLeft: 6,
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 2,
        backgroundColor: C.slateSoft,
        borderWidth: 1,
        borderColor: C.line,
      }}
    >
      <Text style={{ fontSize: 9, fontWeight: "700", letterSpacing: 0.5, color: "#334155" }}>ADMIN</Text>
    </View>
  );
}

function CategoryRow({
  item,
  isEnabled,
  showDivider,
  onToggle,
}: {
  item: AlertCategory;
  isEnabled: boolean;
  showDivider: boolean;
  onToggle: (val: boolean) => void;
}) {
  const Icon = item.Icon;
  const titleColor = isEnabled ? C.ink : C.faint;
  const descColor = isEnabled ? C.muted : "#CBD5E1";
  return (
    <View>
      {showDivider ? <View style={UI.divider} /> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 8,
          opacity: isEnabled ? 1 : 0.72,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            backgroundColor: isEnabled ? C.navySoft : C.slateSoft,
            borderWidth: 1,
            borderColor: isEnabled ? "#BFDBFE" : C.line,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <Icon size={14} color={isEnabled ? C.navy : C.faint} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ ...UI.rowTitle, color: titleColor }} numberOfLines={1}>
              {item.label}
            </Text>
            {item.admin ? <AdminBadge /> : null}
          </View>
          <Text style={{ ...UI.rowDesc, color: descColor }} numberOfLines={1}>
            {item.description}
          </Text>
        </View>
        <Switch
          value={isEnabled}
          onValueChange={onToggle}
          trackColor={{ false: "#CBD5E1", true: C.navy }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#CBD5E1"
          testID={`settings-notif-toggle-${item.key}`}
        />
      </View>
    </View>
  );
}

async function playNotifTonePreview(tone: string) {
  if (tone === "silent") return;
  await ensureAndroidChannelsForPreview();
  const soundFile = tone === "default" ? "default" : `${tone}.wav`;
  const channelId = tone === "default" ? "alenio_main" : `alenio_${tone}`;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Alert preview",
      body: `${notificationToneLabel(tone)} notification sound`,
      sound: soundFile,
      data: { [notificationPreviewDataKey]: true },
    },
    trigger:
      Platform.OS === "android"
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId }
        : null,
  });
}

export function NotificationPreferencesPanel() {
  const queryClient = useQueryClient();
  const [toneExpanded, setToneExpanded] = React.useState(false);

  const { data: notifPrefs, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.get<NotifPrefs>("/api/notification-preferences"),
  });

  const notifMutation = useMutation({
    mutationFn: (patch: Partial<NotifPrefs>) => api.patch<NotifPrefs>("/api/notification-preferences", patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["notification-preferences"] });
      const prev = queryClient.getQueryData<NotifPrefs>(["notification-preferences"]);
      queryClient.setQueryData<NotifPrefs>(["notification-preferences"], (old) =>
        old ? { ...old, ...patch } : old
      );
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["notification-preferences"], ctx.prev);
    },
  });

  const toneMutation = useMutation({
    mutationFn: (tone: string) => api.patch<NotifPrefs>("/api/notification-preferences", { notifTone: tone }),
    onMutate: async (tone) => {
      await queryClient.cancelQueries({ queryKey: ["notification-preferences"] });
      const prev = queryClient.getQueryData<NotifPrefs>(["notification-preferences"]);
      queryClient.setQueryData<NotifPrefs>(["notification-preferences"], (old) =>
        old ? { ...old, notifTone: tone } : old
      );
      return { prev };
    },
    onError: (_err, _tone, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["notification-preferences"], ctx.prev);
    },
  });

  const currentTone = notifPrefs?.notifTone ?? "default";
  const resolvedTone =
    currentTone === "default" || ["bell", "chime", "alert", "silent"].includes(currentTone)
      ? currentTone
      : "default";
  const selectedToneMeta =
    NOTIFICATION_TONES.find((t) => t.value === resolvedTone) ?? NOTIFICATION_TONES[0];
  const isAdmin = notifPrefs?.isAdmin === true;

  if (isLoading && !notifPrefs) {
    return (
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <ActivityIndicator color={C.navy} />
      </View>
    );
  }

  return (
    <View>
      <SectionHeader title="Alert categories" />
      <View style={UI.card}>
        {WORKSPACE_ALERT_CATEGORIES.map((item, index) => (
          <CategoryRow
            key={item.key}
            item={item}
            showDivider={index > 0}
            isEnabled={notifPrefs?.[item.key] ?? true}
            onToggle={(val) => notifMutation.mutate({ [item.key]: val })}
          />
        ))}
      </View>

      {isAdmin ? (
        <>
          <View style={{ height: 14 }} />
          <SectionHeader title="Platform admin" />
          <View style={UI.card}>
            {ADMIN_ALERT_CATEGORIES.map((item, index) => (
              <CategoryRow
                key={item.key}
                item={item}
                showDivider={index > 0}
                isEnabled={notifPrefs?.[item.key] ?? true}
                onToggle={(val) => notifMutation.mutate({ [item.key]: val })}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={{ height: 14 }} />

      <SectionHeader title="Alert tone" />
      <View style={UI.card}>
        <Pressable
          onPress={() => setToneExpanded((open) => !open)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
          testID="settings-tone-collapse-toggle"
        >
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={UI.rowTitle}>{selectedToneMeta.label}</Text>
            <Text style={UI.rowDesc}>{selectedToneMeta.description}</Text>
          </View>
          {resolvedTone !== "silent" ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                void playNotifTonePreview(resolvedTone);
              }}
              hitSlop={10}
              testID={`settings-tone-preview-${resolvedTone}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: C.line,
                backgroundColor: C.surface,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 6,
              }}
              accessibilityLabel="Preview tone"
            >
              <Volume2 size={14} color={C.muted} />
            </Pressable>
          ) : null}
          {toneExpanded ? (
            <ChevronUp size={16} color={C.muted} strokeWidth={2} />
          ) : (
            <ChevronDown size={16} color={C.muted} strokeWidth={2} />
          )}
        </Pressable>

        {toneExpanded
          ? NOTIFICATION_TONES.map((item) => {
              const isSelected =
                currentTone === item.value ||
                (item.value === "default" && !["bell", "chime", "alert", "silent"].includes(currentTone));
              return (
                <View key={item.value}>
                  <View style={{ height: 1, backgroundColor: C.lineSoft, marginLeft: 12 }} />
                  <Pressable
                    onPress={() => {
                      toneMutation.mutate(item.value);
                      setToneExpanded(false);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: isSelected ? C.slateSoft : C.surface,
                    }}
                    testID={`settings-tone-option-${item.value}`}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: isSelected ? 0 : 1.5,
                        borderColor: "#CBD5E1",
                        backgroundColor: isSelected ? C.navy : C.surface,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 10,
                      }}
                    >
                      {isSelected ? <Check size={11} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={UI.rowTitle}>{item.label}</Text>
                      <Text style={UI.rowDesc}>{item.description}</Text>
                    </View>
                    {item.value !== "silent" ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          void playNotifTonePreview(item.value);
                        }}
                        hitSlop={10}
                        testID={`settings-tone-preview-${item.value}`}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: C.line,
                          backgroundColor: C.surface,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        accessibilityLabel={`Preview ${item.label}`}
                      >
                        <Volume2 size={14} color={C.muted} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                </View>
              );
            })
          : null}
      </View>

      <Text
        style={{
          fontSize: 11,
          color: C.faint,
          lineHeight: 15,
          marginTop: 12,
          paddingHorizontal: 2,
        }}
      >
        Preferences sync across devices. System permissions are managed in device settings.
      </Text>
    </View>
  );
}
