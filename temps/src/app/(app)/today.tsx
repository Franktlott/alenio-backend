import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Card, Muted, Screen, Title } from "../../components/ui";
import { useSession } from "../../lib/session-context";
import { listChecksForDay } from "../../lib/temps-api";
import type { WalkOccurrence } from "../../lib/types";
import { colors } from "../../lib/theme";

function formatWindow(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function isReady(item: WalkOccurrence) {
  return item.status === "AVAILABLE" || item.status === "IN_PROGRESS";
}

export default function TodayScreen() {
  const { teamId } = useSession();
  const [today, setToday] = useState<WalkOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!teamId) return;
      setError(null);
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        // Single day list — available rows are derived client-side (no second materialize).
        const day = await listChecksForDay(teamId);
        setToday(day);
      } catch (err) {
        setToday([]);
        setError(err instanceof Error ? err.message : "Failed to load checks");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [teamId],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const availableCount = today.filter(isReady).length;

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.brandDark, letterSpacing: 0.5 }}>
          ALENIO TEMPS
        </Text>
        <Title>Today’s checks</Title>
        <Muted>Open a check to record temperatures. Results sync to Alenio Go.</Muted>
      </View>

      {loading ? (
        <View style={styles.loadingBox} accessibilityLabel="Loading today's checks">
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingTitle}>Loading today’s checks…</Text>
          <Text style={styles.loadingHint}>Pulling open windows for your store</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          data={today}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.brand}
            />
          }
          ListHeaderComponent={
            error ? (
              <Text style={{ color: colors.fail, marginBottom: 12 }}>{error}</Text>
            ) : availableCount > 0 ? (
              <Text style={{ marginBottom: 12, fontWeight: "700", color: colors.ink }}>
                {availableCount} available now
              </Text>
            ) : (
              <View style={{ marginBottom: 12 }}>
                <Muted>No checks in today’s window yet.</Muted>
              </View>
            )
          }
          ListEmptyComponent={
            !error ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Nothing scheduled for today</Text>
                <Muted>When a walk window opens, it will show up here.</Muted>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const ready = isReady(item);
            return (
              <Card
                onPress={ready ? () => router.push(`/(app)/check/${item.id}`) : undefined}
              >
                <Text style={{ fontSize: 17, fontWeight: "700", color: colors.ink }}>
                  {item.template?.name ?? "Temperature check"}
                </Text>
                <Text style={{ marginTop: 4, color: colors.muted, fontSize: 14 }}>
                  {formatWindow(item.windowStart)} – {formatWindow(item.dueAt)}
                  {item.schedule?.name ? ` · ${item.schedule.name}` : ""}
                </Text>
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    fontWeight: "700",
                    color: ready ? colors.brandDark : colors.muted,
                  }}
                >
                  {ready ? "TAP TO TAKE" : item.status}
                </Text>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    marginTop: 48,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 10,
  },
  loadingTitle: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
  },
  loadingHint: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.muted,
    textAlign: "center",
  },
  emptyBox: {
    marginTop: 28,
    paddingVertical: 20,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
});
