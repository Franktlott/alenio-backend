import { useEffect, useState } from "react";
import {
  disconnectMicrosoftCalendar,
  fetchCalendarConnections,
  startMicrosoftCalendarConnect,
  syncMicrosoftCalendar,
  type CalendarConnectionSummary,
} from "@/lib/outlook-calendar-api";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { Alert, Linking, Text, View } from "react-native";
import { ProfileCard, ProfileDivider, ProfileMenuRow } from "./ProfileEnterpriseUI";
import { Calendar } from "lucide-react-native";

export function OutlookCalendarCard() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [connection, setConnection] = useState<CalendarConnectionSummary | null>(null);

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

  useEffect(() => {
    void load();
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const url = await startMicrosoftCalendarConnect("mobile");
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert("Outlook", e instanceof Error ? e.message : "Could not start Outlook connection.");
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
              Alert.alert("Outlook", e instanceof Error ? e.message : "Could not sync Outlook.");
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
                    Alert.alert("Outlook", e instanceof Error ? e.message : "Could not disconnect Outlook.");
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

  return (
    <ProfileCard>
      <ProfileMenuRow
        icon={Calendar}
        title="Outlook calendar"
        subtitle={subtitle}
        onPress={busy ? undefined : onPress}
        testID="outlook-calendar-row"
      />
      {connection?.syncError ? (
        <>
          <ProfileDivider inset />
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <Text style={{ fontSize: 12, color: "#DC2626" }}>{connection.syncError}</Text>
          </View>
        </>
      ) : null}
    </ProfileCard>
  );
}
