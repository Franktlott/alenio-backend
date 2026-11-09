import { useCallback, useEffect, useState } from "react";
import {
  disconnectMicrosoftCalendar,
  fetchCalendarConnections,
  fetchMicrosoftOutlookCalendars,
  startMicrosoftCalendarConnect,
  syncMicrosoftCalendar,
  updateMicrosoftOutlookCalendar,
  type CalendarConnectionSummary,
  type MicrosoftOutlookCalendarOption,
} from "@/lib/outlook-calendar-api";
import { formatOutlookUserError } from "@/lib/outlook-calendar-errors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { ActivityIndicator, Alert, AppState, Linking, Pressable, Text, View } from "react-native";
import { ProfileCard, ProfileDivider, ProfileMenuRow } from "./ProfileEnterpriseUI";
import { Calendar, CalendarDays, Check, RefreshCw, Unlink } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";

export const CALENDAR_CONNECTIONS_QUERY_KEY = ["calendar-connections"] as const;

function OutlookInlineNotice({ message }: { message: string }) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: "#FFF7ED",
        borderWidth: 1,
        borderColor: "#FED7AA",
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#9A3412", marginBottom: 2 }}>Sync issue</Text>
      <Text style={{ fontSize: 12, color: "#9A3412", lineHeight: 17 }}>{message}</Text>
    </View>
  );
}

export function OutlookCalendarCard() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendars, setCalendars] = useState<MicrosoftOutlookCalendarOption[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(false);

  const {
    data,
    isLoading: loading,
    refetch,
  } = useQuery({
    queryKey: CALENDAR_CONNECTIONS_QUERY_KEY,
    queryFn: fetchCalendarConnections,
    staleTime: 0,
  });

  const configured = data?.configured ?? false;
  const connection = data?.connections.find((c) => c.provider === "microsoft") ?? null;

  const loadCalendars = useCallback(async () => {
    setCalendarsLoading(true);
    try {
      const list = await fetchMicrosoftOutlookCalendars();
      setCalendars(list);
    } catch (e) {
      Alert.alert("Outlook calendar", formatOutlookUserError(e instanceof Error ? e.message : undefined));
      setCalendarModalOpen(false);
    } finally {
      setCalendarsLoading(false);
    }
  }, []);

  // After Microsoft OAuth, the app returns from the browser — refetch immediately.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void queryClient.invalidateQueries({ queryKey: CALENDAR_CONNECTIONS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
      }
    });
    return () => sub.remove();
  }, [queryClient]);

  useEffect(() => {
    if (!calendarModalOpen || !connection?.connected) return;
    void loadCalendars();
  }, [calendarModalOpen, connection?.connected, loadCalendars]);

  const setConnectionOptimistic = (updated: CalendarConnectionSummary) => {
    queryClient.setQueryData(CALENDAR_CONNECTIONS_QUERY_KEY, (prev: typeof data) => {
      if (!prev) {
        return { configured: true, connections: [updated] };
      }
      const others = prev.connections.filter((c) => c.provider !== "microsoft");
      return { ...prev, connections: [...others, updated] };
    });
  };

  const connect = async () => {
    setBusy(true);
    try {
      const url = await startMicrosoftCalendarConnect("mobile");
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert("Outlook calendar", formatOutlookUserError(e instanceof Error ? e.message : undefined));
    } finally {
      setBusy(false);
    }
  };

  const chooseCalendar = async (calendar: MicrosoftOutlookCalendarOption) => {
    if (connection?.externalCalendarId === calendar.id) {
      setCalendarModalOpen(false);
      return;
    }
    setBusy(true);
    try {
      const updated = await updateMicrosoftOutlookCalendar(calendar.id, calendar.name);
      setConnectionOptimistic(updated);
      await queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
      setCalendarModalOpen(false);
      toast({ title: "Calendar updated", preset: "done" });
    } catch (e) {
      Alert.alert("Outlook calendar", formatOutlookUserError(e instanceof Error ? e.message : undefined));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      const updated = await syncMicrosoftCalendar();
      setConnectionOptimistic(updated);
      await queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
      toast({ title: "Outlook synced", preset: "done" });
    } catch (e) {
      Alert.alert("Outlook calendar", formatOutlookUserError(e instanceof Error ? e.message : undefined));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectMicrosoftCalendar();
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
      setDisconnectConfirmOpen(false);
      toast({ title: "Outlook disconnected", preset: "done" });
    } catch (e) {
      Alert.alert("Outlook calendar", formatOutlookUserError(e instanceof Error ? e.message : undefined));
    } finally {
      setBusy(false);
    }
  };

  const onPress = () => {
    if (!configured) return;
    if (!connection?.connected) {
      void connect();
      return;
    }
    setActionsOpen(true);
  };

  if (loading) {
    return (
      <ProfileCard>
        <Text
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: "#64748B",
            fontSize: 13,
            lineHeight: 18,
            textAlign: "left",
          }}
        >
          Loading calendar settings…
        </Text>
      </ProfileCard>
    );
  }

  if (!configured) {
    return (
      <ProfileCard>
        <Text
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: "#64748B",
            fontSize: 13,
            lineHeight: 18,
            textAlign: "left",
          }}
        >
          Outlook calendar sync is not enabled on this server yet.
        </Text>
      </ProfileCard>
    );
  }

  const subtitle = connection?.connected
    ? `${connection.accountEmail ?? "Connected"}${connection.lastSyncedAt ? ` · Synced ${new Date(connection.lastSyncedAt).toLocaleDateString()}` : ""}`
    : "Show your Outlook events on your calendar";

  const syncError = connection?.syncError ? formatOutlookUserError(connection.syncError) : null;
  const calendarLabel = connection?.externalCalendarName ?? "Choose a calendar";

  return (
    <>
      <ProfileCard>
        <ProfileMenuRow
          icon={Calendar}
          title="Outlook Calendar"
          subtitle={subtitle}
          onPress={busy ? undefined : onPress}
          testID="outlook-calendar-row"
        />
        {connection?.connected ? (
          <>
            <ProfileDivider />
            <ProfileMenuRow
              title="Calendar to sync"
              subtitle={calendarLabel}
              onPress={busy ? undefined : () => setCalendarModalOpen(true)}
              testID="outlook-calendar-picker-row"
            />
          </>
        ) : null}
        {syncError ? (
          <>
            <ProfileDivider />
            <OutlookInlineNotice message={syncError} />
          </>
        ) : null}
      </ProfileCard>

      <AlenioBottomSheet
        visible={actionsOpen}
        title="Outlook calendar"
        subtitle={connection?.accountEmail ?? "Connected account"}
        onClose={() => setActionsOpen(false)}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="outlook-calendar-actions-sheet"
      >
        <View style={{ gap: 8, paddingBottom: 10 }}>
          <AlenioSheetOption
            compact
            tint="slate"
            icon={<CalendarDays size={16} color="#FFFFFF" />}
            title="Choose calendar"
            subtitle={calendarLabel}
            onPress={() => {
              setActionsOpen(false);
              setTimeout(() => setCalendarModalOpen(true), 220);
            }}
            testID="outlook-choose-calendar-option"
          />
          <AlenioSheetOption
            compact
            tint="slate"
            icon={<RefreshCw size={16} color="#FFFFFF" />}
            title="Sync now"
            subtitle="Refresh your Outlook events"
            onPress={() => {
              setActionsOpen(false);
              setTimeout(() => void syncNow(), 220);
            }}
            testID="outlook-sync-now-option"
          />
          <AlenioSheetOption
            compact
            destructive
            icon={<Unlink size={16} color="#FFFFFF" />}
            title="Disconnect Outlook"
            subtitle="Stop syncing this account"
            onPress={() => {
              setActionsOpen(false);
              setTimeout(() => setDisconnectConfirmOpen(true), 220);
            }}
            testID="outlook-disconnect-option"
          />
        </View>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={calendarModalOpen}
        title="Choose calendar"
        subtitle="Select the Outlook calendar to sync with Alenio"
        onClose={() => setCalendarModalOpen(false)}
        compact
        showCloseButton
        showScrollIndicator={calendars.length > 5}
        bodyHeightRatio={0.56}
        sheetStyle={{ maxHeight: "78%" }}
        testID="outlook-calendar-picker-sheet"
      >
        {calendarsLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : calendars.length === 0 ? (
          <AlenioSheetCard tint="slate" compact>
            <Text style={{ paddingVertical: 8, color: "#64748B", fontSize: 13, textAlign: "center" }}>
              No Outlook calendars found on this account.
            </Text>
          </AlenioSheetCard>
        ) : (
          <AlenioSheetCard tint="slate" compact style={{ paddingVertical: 0, overflow: "hidden" }}>
            {calendars.map((calendar, index) => {
              const selected = connection?.externalCalendarId === calendar.id;
              return (
                <Pressable
                  key={calendar.id}
                  onPress={() => void chooseCalendar(calendar)}
                  disabled={busy}
                  style={{
                    minHeight: 54,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: "#E8EDF4",
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: selected ? "700" : "600", color: "#0F172A" }}>
                      {calendar.name}
                    </Text>
                    {calendar.isDefaultCalendar ? (
                      <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Default calendar</Text>
                    ) : null}
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? "#4361EE" : "#FFFFFF",
                      borderWidth: 1,
                      borderColor: selected ? "#4361EE" : "#D8DEE9",
                    }}
                  >
                    {selected ? <Check size={14} color="#FFFFFF" strokeWidth={2.5} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </AlenioSheetCard>
        )}
        <View style={{ height: 14 }} />
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={disconnectConfirmOpen}
        title="Disconnect Outlook?"
        subtitle="Your synced Outlook events will be removed from Alenio."
        onClose={() => {
          if (!busy) setDisconnectConfirmOpen(false);
        }}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="outlook-disconnect-confirmation"
        footer={
          <View style={{ gap: 8 }}>
            <Pressable
              onPress={() => void disconnect()}
              disabled={busy}
              style={[alenioSheetStyles.primaryButton, { backgroundColor: "#EF4444" }]}
              testID="confirm-outlook-disconnect"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>Disconnect Outlook</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setDisconnectConfirmOpen(false)}
              disabled={busy}
              style={alenioSheetStyles.cancelButton}
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Keep connected</Text>
            </Pressable>
          </View>
        }
      >
        <AlenioSheetCard tint="danger" compact>
          <Text style={{ fontSize: 13, lineHeight: 19, color: "#9F3535" }}>
            You can reconnect this Outlook account at any time.
          </Text>
        </AlenioSheetCard>
      </AlenioBottomSheet>
    </>
  );
}
