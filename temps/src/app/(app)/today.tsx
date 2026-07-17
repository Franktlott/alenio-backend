import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { Card, Muted, Screen, Title } from "../../components/ui";
import { useSession } from "../../lib/session-context";
import { listAvailableChecks, listChecksForDay } from "../../lib/temps-api";
import type { WalkOccurrence } from "../../lib/types";
import { colors } from "../../lib/theme";

function formatWindow(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function TodayScreen() {
  const { teamId } = useSession();
  const [available, setAvailable] = useState<WalkOccurrence[]>([]);
  const [today, setToday] = useState<WalkOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setError(null);
    try {
      // Prefer today's full list; available is best-effort (materializes windows).
      const dayResult = await listChecksForDay(teamId).then(
        (d) => ({ ok: true as const, d }),
        (err) => ({ ok: false as const, err }),
      );
      if (!dayResult.ok) {
        setToday([]);
        setAvailable([]);
        setError(dayResult.err instanceof Error ? dayResult.err.message : "Failed to load checks");
        return;
      }
      setToday(dayResult.d);
      try {
        setAvailable(await listAvailableChecks(teamId));
      } catch {
        setAvailable(dayResult.d.filter((o) => o.status === "AVAILABLE" || o.status === "IN_PROGRESS"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load checks");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const availableIds = new Set(available.map((o) => o.id));

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.brandDark, letterSpacing: 0.5 }}>
          ALENIO TEMPS
        </Text>
        <Title>Today’s checks</Title>
        <Muted>Open a check to record temperatures. Results sync to Alenio Go.</Muted>
      </View>

      {loading && available.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : (
        <FlatList
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          data={today.length ? today : available}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListHeaderComponent={
            error ? (
              <Text style={{ color: colors.fail, marginBottom: 12 }}>{error}</Text>
            ) : available.length > 0 ? (
              <Text style={{ marginBottom: 12, fontWeight: "700", color: colors.ink }}>
                {available.length} available now
              </Text>
            ) : (
              <Muted>No checks in today’s window yet.</Muted>
            )
          }
          renderItem={({ item }) => {
            const ready = availableIds.has(item.id) || item.status === "AVAILABLE" || item.status === "IN_PROGRESS";
            return (
              <Card
                onPress={
                  ready
                    ? () => router.push(`/(app)/check/${item.id}`)
                    : undefined
                }
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
