import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Platform,
} from "react-native";
import * as Notifications from "expo-notifications";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Bell, Check, Volume2, X } from "lucide-react-native";
import { useSession } from "@/lib/auth/use-session";
import { ensureAndroidChannelsForPreview, getNotifDebugLog, getNotifStatus, notificationPreviewDataKey } from "@/lib/notifications";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";

type NotifPrefs = {
  notifMessages: boolean;
  notifTaskAssigned: boolean;
  notifTaskDue: boolean;
  notifMeetings: boolean;
  notifTone: string;
  hasToken: boolean;
};

function GlassCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <BlurView
      intensity={60}
      tint="light"
      style={[
        {
          borderRadius: 20,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.6)",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        },
        style,
      ]}
    >
      <View style={{ backgroundColor: "rgba(255,255,255,0.45)" }}>
        {children}
      </View>
    </BlurView>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const user = session?.user;

  const { data: notifPrefs } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.get<NotifPrefs>("/api/notification-preferences"),
    enabled: !!user,
  });

  const notifMutation = useMutation({
    mutationFn: (patch: Partial<NotifPrefs>) =>
      api.patch<NotifPrefs>("/api/notification-preferences", patch),
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
    mutationFn: (tone: string) =>
      api.patch<NotifPrefs>("/api/notification-preferences", { notifTone: tone }),
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

  const playPreview = async (tone: string) => {
    if (tone === "silent") return;
    await ensureAndroidChannelsForPreview();
    const soundFile = tone === "default" ? "default" : `${tone}.wav`;
    const channelId = tone === "default" ? "alenio_main" : `alenio_${tone}`;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Sound Preview",
        body: `Testing ${tone === "default" ? "Default" : tone.charAt(0).toUpperCase() + tone.slice(1)} sound`,
        sound: soundFile,
        data: { [notificationPreviewDataKey]: true },
      },
      trigger:
        Platform.OS === "android"
          ? {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 1,
              channelId,
            }
          : null,
    });
  };

  const [notifRegStatus, setNotifRegStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = () => {
      Promise.all([getNotifStatus(), getNotifDebugLog()]).then(([s]) => {
        if (cancelled) return;
        setNotifRegStatus(s);
        if (
          s?.startsWith("getting token") ||
          s?.startsWith("saving token") ||
          s?.startsWith("attempt")
        ) {
          timer = setTimeout(poll, 2000);
        }
      });
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["bottom"]}
      testID="settings-screen"
    >
      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.2)",
            }}
            testID="settings-back-button"
          >
            <X size={18} color="white" />
          </Pressable>
          <Text
            style={{
              color: "white",
              fontSize: 20,
              fontWeight: "800",
              marginLeft: 12,
            }}
          >
            Settings
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* Notifications */}
        <View className="mx-4 mt-5">
          <View className="flex-row items-center mb-3" style={{ gap: 6 }}>
            <Bell size={13} color="#94A3B8" />
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Notifications
            </Text>
          </View>
          <GlassCard>
            {[
              {
                key: "notifMessages" as const,
                label: "New messages",
                description: "Team and direct messages",
              },
              {
                key: "notifTaskAssigned" as const,
                label: "Task assigned",
                description: "When a task is assigned to you",
              },
              {
                key: "notifTaskDue" as const,
                label: "Task due reminders",
                description: "Reminders for upcoming due dates",
              },
              {
                key: "notifMeetings" as const,
                label: "Meeting reminders",
                description: "Alerts before video meetings",
              },
            ].map((item, index, arr) => {
              const isEnabled = notifPrefs?.[item.key] ?? true;
              return (
                <View
                  key={item.key}
                  className="flex-row items-center px-4 py-3.5"
                  style={
                    index < arr.length - 1
                      ? { borderBottomWidth: 1, borderBottomColor: "rgba(241,245,249,0.8)" }
                      : undefined
                  }
                >
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-white">
                      {item.label}
                    </Text>
                    <Text className="text-xs text-slate-400 mt-0.5">{item.description}</Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={(val) => notifMutation.mutate({ [item.key]: val })}
                    trackColor={{ false: "#E2E8F0", true: "#6B8EF6" }}
                    thumbColor="white"
                    testID={`settings-notif-toggle-${item.key}`}
                  />
                </View>
              );
            })}
          </GlassCard>

          {/* Push token status */}
          <View className="mt-2 mb-1 px-1" style={{ gap: 4 }}>
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: notifPrefs?.hasToken ? "#22C55E" : "#EF4444",
                }}
              />
            </View>
            {notifRegStatus && !notifPrefs?.hasToken ? (
              <Text className="text-xs text-slate-300 ml-3" selectable>
                {notifRegStatus}
              </Text>
            ) : null}
          </View>

          {/* Notification Sound */}
          <View className="mt-3">
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">
              Notification Sound
            </Text>
            <GlassCard>
              {[
                { value: "default", label: "Default", emoji: "🔔" },
                { value: "bell", label: "Bell", emoji: "🔕" },
                { value: "chime", label: "Chime", emoji: "🎵" },
                { value: "alert", label: "Alert", emoji: "⚠️" },
                { value: "silent", label: "Silent", emoji: "🚫" },
              ].map((item, index, arr) => {
                const currentTone = notifPrefs?.notifTone ?? "default";
                const isSelected =
                  currentTone === item.value ||
                  (item.value === "default" &&
                    !["bell", "chime", "alert", "silent"].includes(currentTone));
                return (
                  <View
                    key={item.value}
                    className="flex-row items-center px-4 py-3.5"
                    style={
                      index < arr.length - 1
                        ? { borderBottomWidth: 1, borderBottomColor: "rgba(241,245,249,0.8)" }
                        : undefined
                    }
                  >
                    <Pressable
                      className="flex-row items-center flex-1"
                      onPress={() => toneMutation.mutate(item.value)}
                      testID={`settings-tone-option-${item.value}`}
                    >
                      <Text className="text-base mr-3">{item.emoji}</Text>
                      <Text className="text-sm font-semibold text-slate-900 dark:text-white">
                        {item.label}
                      </Text>
                    </Pressable>
                    {isSelected ? (
                      <Check size={16} color="#4361EE" />
                    ) : item.value !== "silent" ? (
                      <Pressable
                        onPress={() => playPreview(item.value)}
                        testID={`settings-tone-preview-${item.value}`}
                        className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
                      >
                        <Volume2 size={14} color="#64748B" />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </GlassCard>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
