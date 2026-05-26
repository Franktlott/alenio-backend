import React from "react";
import { View, Text, Pressable, Platform, Switch, ActivityIndicator } from "react-native";
import * as Notifications from "expo-notifications";
import { Check, Volume2, MessageSquare, ClipboardList, Calendar, Video } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { ensureAndroidChannelsForPreview, notificationPreviewDataKey } from "@/lib/notifications";

export type NotifPrefs = {
  notifMessages: boolean;
  notifTaskAssigned: boolean;
  notifTaskDue: boolean;
  notifMeetings: boolean;
  notifTone: string;
  hasToken: boolean;
};

export const NOTIFICATION_TONES = [
  { value: "default", label: "Default", description: "Platform standard alert" },
  { value: "bell", label: "Bell", description: "Single clear tone" },
  { value: "chime", label: "Chime", description: "Soft, unobtrusive" },
  { value: "alert", label: "Alert", description: "High-attention signal" },
  { value: "silent", label: "Silent", description: "Visual only, no audio" },
] as const;

const ALERT_CATEGORIES: {
  key: keyof Pick<NotifPrefs, "notifMessages" | "notifTaskAssigned" | "notifTaskDue" | "notifMeetings">;
  label: string;
  description: string;
  Icon: LucideIcon;
}[] = [
  { key: "notifMessages", label: "Messages", description: "Team channels and direct messages", Icon: MessageSquare },
  { key: "notifTaskAssigned", label: "Task assignments", description: "When work is assigned to you", Icon: ClipboardList },
  { key: "notifTaskDue", label: "Due date reminders", description: "Upcoming deadlines and overdue items", Icon: Calendar },
  { key: "notifMeetings", label: "Meetings", description: "Video session start and reminders", Icon: Video },
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
  const enabled = flags.filter(Boolean).length;
  const tone = notificationToneLabel(prefs.notifTone);
  if (enabled === 0) return `All categories off · ${tone}`;
  if (enabled === flags.length) return `All categories on · ${tone}`;
  return `${enabled} of ${flags.length} categories · ${tone}`;
}

const ENTERPRISE = {
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    color: "#64748B",
    textTransform: "uppercase" as const,
  },
  rowTitle: { fontSize: 15, fontWeight: "600" as const, color: "#0F172A" },
  rowDesc: { fontSize: 13, color: "#64748B", marginTop: 2, lineHeight: 18 },
  divider: { height: 1, backgroundColor: "#F1F5F9", marginLeft: 16 },
};

function EnterpriseCard({ children }: { children: React.ReactNode }) {
  return <View style={ENTERPRISE.card}>{children}</View>;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 10, paddingHorizontal: 2 }}>
      <Text style={ENTERPRISE.sectionLabel}>{title}</Text>
      {subtitle ? <Text style={{ ...ENTERPRISE.rowDesc, marginTop: 6 }}>{subtitle}</Text> : null}
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

  if (isLoading && !notifPrefs) {
    return (
      <View style={{ paddingVertical: 48, alignItems: "center" }}>
        <ActivityIndicator color="#1E40AF" />
      </View>
    );
  }

  return (
    <View>
      <SectionHeader
        title="Alert categories"
        subtitle="Choose which workspace events send push notifications to this device."
      />
      <EnterpriseCard>
        {ALERT_CATEGORIES.map((item, index) => {
          const isEnabled = notifPrefs?.[item.key] ?? true;
          const Icon = item.Icon;
          return (
            <View key={item.key}>
              {index > 0 ? <View style={ENTERPRISE.divider} /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Icon size={18} color="#475569" strokeWidth={2} />
                </View>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={ENTERPRISE.rowTitle}>{item.label}</Text>
                  <Text style={ENTERPRISE.rowDesc}>{item.description}</Text>
                </View>
                <Switch
                  value={isEnabled}
                  onValueChange={(val) => notifMutation.mutate({ [item.key]: val })}
                  trackColor={{ false: "#CBD5E1", true: "#1E40AF" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#CBD5E1"
                  testID={`settings-notif-toggle-${item.key}`}
                />
              </View>
            </View>
          );
        })}
      </EnterpriseCard>

      <View style={{ height: 28 }} />

      <SectionHeader title="Alert tone" subtitle="Sound played when a push notification is delivered." />
      <EnterpriseCard>
        {NOTIFICATION_TONES.map((item, index) => {
          const isSelected =
            currentTone === item.value ||
            (item.value === "default" && !["bell", "chime", "alert", "silent"].includes(currentTone));
          return (
            <View key={item.value}>
              {index > 0 ? <View style={ENTERPRISE.divider} /> : null}
              <Pressable
                onPress={() => toneMutation.mutate(item.value)}
                style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}
                testID={`settings-tone-option-${item.value}`}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={ENTERPRISE.rowTitle}>{item.label}</Text>
                  <Text style={ENTERPRISE.rowDesc}>{item.description}</Text>
                </View>
                {isSelected ? (
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: "#1E40AF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Check size={13} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : item.value !== "silent" ? (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation?.();
                      void playNotifTonePreview(item.value);
                    }}
                    hitSlop={8}
                    testID={`settings-tone-preview-${item.value}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      backgroundColor: "#F8FAFC",
                      gap: 4,
                    }}
                  >
                    <Volume2 size={14} color="#475569" />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>Preview</Text>
                  </Pressable>
                ) : (
                  <View style={{ width: 22 }} />
                )}
              </Pressable>
            </View>
          );
        })}
      </EnterpriseCard>

      <Text
        style={{
          fontSize: 12,
          color: "#94A3B8",
          lineHeight: 18,
          marginTop: 20,
          paddingHorizontal: 4,
        }}
      >
        Preferences apply to this account and sync when you sign in on another device. System notification permissions
        are managed in your device settings.
      </Text>
    </View>
  );
}
