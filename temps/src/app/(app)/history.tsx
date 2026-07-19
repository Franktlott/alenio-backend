import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTabHeader } from "../../components/AppTabHeader";
import { useSession } from "../../lib/session-context";
import { listChecksInRange } from "../../lib/temps-api";
import type { WalkOccurrence } from "../../lib/types";
import { colors } from "../../lib/theme";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function formatDayLabel(d: Date) {
  const today = startOfDay(new Date());
  const day = startOfDay(d);
  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === addDays(today, -1).getTime()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function statusTone(status: string): "pass" | "fail" | "late" | "neutral" {
  if (status === "COMPLETED") return "pass";
  if (status === "COMPLETED_LATE") return "late";
  if (status === "MISSED") return "fail";
  return "neutral";
}

function statusLabel(status: string) {
  if (status === "COMPLETED") return "Complete";
  if (status === "COMPLETED_LATE") return "Late";
  if (status === "MISSED") return "Missed";
  if (status === "IN_PROGRESS") return "In progress";
  return status;
}

type DayGroup = { day: Date; label: string; rows: WalkOccurrence[] };

export default function HistoryScreen() {
  const { teamId } = useSession();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<WalkOccurrence[]>([]);
  const [rangeDays, setRangeDays] = useState<7 | 14>(7);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!teamId) return;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const today = startOfDay(new Date());
        const from = addDays(today, -(rangeDays - 1));
        const data = await listChecksInRange(teamId, from, today);
        setRows(data);
      } catch (err) {
        setRows([]);
        setError(err instanceof Error ? err.message : "Could not load history");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [teamId, rangeDays],
  );

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  const groups = useMemo(() => {
    const history = rows.filter((r) =>
      ["COMPLETED", "COMPLETED_LATE", "MISSED", "IN_PROGRESS"].includes(r.status),
    );
    const byDay = new Map<string, DayGroup>();
    for (const row of history) {
      const day = startOfDay(new Date(row.dueAt));
      const key = day.toISOString();
      const existing = byDay.get(key);
      if (existing) existing.rows.push(row);
      else byDay.set(key, { day, label: formatDayLabel(day), rows: [row] });
    }
    return [...byDay.values()]
      .sort((a, b) => b.day.getTime() - a.day.getTime())
      .map((g) => ({
        ...g,
        rows: g.rows.sort(
          (a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime(),
        ),
      }));
  }, [rows]);

  const stats = useMemo(() => {
    const completed = rows.filter(
      (r) => r.status === "COMPLETED" || r.status === "COMPLETED_LATE",
    ).length;
    const missed = rows.filter((r) => r.status === "MISSED").length;
    return { completed, missed, total: completed + missed };
  }, [rows]);

  return (
    <View style={styles.screen}>
      <AppTabHeader topInset={insets.top} testID="temps-history-header" />
      <View style={styles.body}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.sub}>
          {stats.completed} complete · {stats.missed} missed · last {rangeDays} days
        </Text>

        <View style={styles.rangeRow}>
          {([7, 14] as const).map((n) => (
            <Pressable
              key={n}
              style={[styles.rangeChip, rangeDays === n && styles.rangeChipOn]}
              onPress={() => setRangeDays(n)}
            >
              <Text style={[styles.rangeChipText, rangeDays === n && styles.rangeChipTextOn]}>
                {n} days
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load("refresh")}
                tintColor={colors.brand}
              />
            }
            contentContainerStyle={styles.scroll}
          >
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {groups.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyGlyph}>◷</Text>
                <Text style={styles.emptyTitle}>No checks yet</Text>
                <Text style={styles.emptyBody}>
                  Completed and missed temperature checks from the last {rangeDays} days show
                  here.
                </Text>
              </View>
            ) : (
              groups.map((group) => (
                <View key={group.label} style={styles.group}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  {group.rows.map((item) => {
                    const tone = statusTone(item.status);
                    return (
                      <View key={item.id} style={styles.row}>
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {item.template?.name ?? "Checklist"}
                          </Text>
                          <Text style={styles.rowMeta}>
                            Due {formatTime(item.dueAt)}
                            {item.completedByName ? ` · ${item.completedByName}` : ""}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            tone === "pass" && styles.badgePass,
                            tone === "fail" && styles.badgeFail,
                            tone === "late" && styles.badgeLate,
                          ]}
                        >
                          <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.inkOnDark,
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: colors.mutedOnDark,
  },
  rangeRow: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 8 },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  rangeChipOn: { backgroundColor: colors.brand },
  rangeChipText: { fontSize: 12, fontWeight: "700", color: colors.mutedOnDark },
  rangeChipTextOn: { color: "#fff" },
  scroll: { paddingBottom: 40, gap: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#fca5a5", fontWeight: "600", marginBottom: 8 },
  empty: { alignItems: "center", paddingTop: 48, gap: 8 },
  emptyGlyph: { fontSize: 36, color: colors.mutedOnDark },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.inkOnDark },
  emptyBody: {
    fontSize: 14,
    color: colors.mutedOnDark,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  group: { gap: 8 },
  groupLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.mutedOnDark,
    letterSpacing: 0.04,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.inkOnDark },
  rowMeta: { fontSize: 12, fontWeight: "500", color: colors.mutedOnDark },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  badgePass: { backgroundColor: "rgba(34,197,94,0.2)" },
  badgeFail: { backgroundColor: "rgba(239,68,68,0.2)" },
  badgeLate: { backgroundColor: "rgba(245,158,11,0.22)" },
  badgeText: { fontSize: 11, fontWeight: "800", color: colors.inkOnDark },
});
