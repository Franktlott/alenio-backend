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
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { ProfileCard, ProfileDivider, ProfileMenuRow } from "./ProfileEnterpriseUI";
import { Calendar, Check, X } from "lucide-react-native";

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [connection, setConnection] = useState<CalendarConnectionSummary | null>(null);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendars, setCalendars] = useState<MicrosoftOutlookCalendarOption[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchCalendarConnections();
      setConfigured(data.configured);
      setConnection(data.connections.find((c) => c.provider === "microsoft") ?? null);
    } catch {
      setConfigured(false);
      setConnection(null);
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!calendarModalOpen || !connection?.connected) return;
    void loadCalendars();
  }, [calendarModalOpen, connection?.connected, loadCalendars]);

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
      setConnection(updated);
      await queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
      setCalendarModalOpen(false);
      toast({ title: "Calendar updated", preset: "done" });
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
    Alert.alert("Outlook calendar", connection.accountEmail ?? "Connected", [
      {
        text: "Choose calendar",
        onPress: () => setCalendarModalOpen(true),
      },
      {
        text: "Sync now",
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              const updated = await syncMicrosoftCalendar();
              setConnection(updated);
              await queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
              toast({ title: "Outlook synced", preset: "done" });
            } catch (e) {
              Alert.alert("Outlook calendar", formatOutlookUserError(e instanceof Error ? e.message : undefined));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          Alert.alert("Disconnect Outlook?", "Your busy blocks will be removed from Alenio.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Disconnect",
              style: "destructive",
              onPress: () => {
                void (async () => {
                  setBusy(true);
                  try {
                    await disconnectMicrosoftCalendar();
                    await load();
                    await queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
                    toast({ title: "Outlook disconnected", preset: "done" });
                  } catch (e) {
                    Alert.alert("Outlook calendar", formatOutlookUserError(e instanceof Error ? e.message : undefined));
                  } finally {
                    setBusy(false);
                  }
                })();
              },
            },
          ]);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  if (loading) {
    return (
      <ProfileCard>
        <Text style={{ padding: 16, color: "#64748B", fontSize: 14 }}>Loading calendar settings…</Text>
      </ProfileCard>
    );
  }

  if (!configured) {
    return (
      <ProfileCard>
        <Text style={{ padding: 16, color: "#64748B", fontSize: 14 }}>
          Outlook calendar sync is not enabled on this server yet.
        </Text>
      </ProfileCard>
    );
  }

  const subtitle = connection?.connected
    ? `${connection.accountEmail ?? "Connected"}${connection.lastSyncedAt ? ` · Synced ${new Date(connection.lastSyncedAt).toLocaleDateString()}` : ""}`
    : "Show personal busy times on your calendar";

  const syncError = connection?.syncError ? formatOutlookUserError(connection.syncError) : null;
  const calendarLabel = connection?.externalCalendarName ?? "Choose a calendar";

  return (
    <>
      <ProfileCard>
        <ProfileMenuRow
          icon={Calendar}
          title="Outlook calendar"
          subtitle={subtitle}
          onPress={busy ? undefined : onPress}
          testID="outlook-calendar-row"
        />
        {connection?.connected ? (
          <>
            <ProfileDivider inset />
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
            <ProfileDivider inset />
            <OutlookInlineNotice message={syncError} />
          </>
        ) : null}
      </ProfileCard>

      <Modal visible={calendarModalOpen} transparent animationType="slide" onRequestClose={() => setCalendarModalOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" }}>
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: "#F1F5F9",
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>Choose calendar</Text>
              <Pressable onPress={() => setCalendarModalOpen(false)} hitSlop={8} accessibilityLabel="Close">
                <X size={20} color="#64748B" />
              </Pressable>
            </View>
            {calendarsLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <ActivityIndicator color="#4361EE" />
              </View>
            ) : calendars.length === 0 ? (
              <Text style={{ padding: 20, color: "#64748B", fontSize: 14, textAlign: "center" }}>
                No Outlook calendars found on this account.
              </Text>
            ) : (
              <ScrollView>
                {calendars.map((calendar) => {
                  const selected = connection?.externalCalendarId === calendar.id;
                  return (
                    <Pressable
                      key={calendar.id}
                      onPress={() => void chooseCalendar(calendar)}
                      disabled={busy}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: "#F8FAFC",
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ fontSize: 15, fontWeight: selected ? "700" : "600", color: "#0F172A" }}>
                          {calendar.name}
                        </Text>
                        {calendar.isDefaultCalendar ? (
                          <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Default calendar</Text>
                        ) : null}
                      </View>
                      {selected ? <Check size={18} color="#4361EE" /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
