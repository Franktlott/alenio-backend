import { router, useFocusEffect, useNavigation } from "expo-router";
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
import { HomeMenu } from "../../components/HomeMenu";
import { listPendingSyncDrafts } from "../../lib/check-draft-store";
import { loadDayOccurrences, saveCachedRun, saveDayOccurrences } from "../../lib/day-cache";
import { useSession } from "../../lib/session-context";
import { listChecksForDay, startCheckRun } from "../../lib/temps-api";
import type { WalkOccurrence } from "../../lib/types";
import { colors } from "../../lib/theme";

/** Prefetch run snapshots so associates can open ready checks offline. */
async function prefetchReadyRuns(teamId: string, day: WalkOccurrence[]) {
  const ready = day
    .filter(
      (item) =>
        (item.status === "AVAILABLE" || item.status === "IN_PROGRESS") &&
        (() => {
          const now = Date.now();
          const start = new Date(item.windowStart).getTime();
          const end = new Date(item.graceEndsAt ?? item.dueAt).getTime();
          return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
        })(),
    )
    .slice(0, 8);

  for (const item of ready) {
    try {
      const run = await startCheckRun(teamId, item.id);
      await saveCachedRun(teamId, item.id, run);
    } catch {
      // Ignore — network/claim errors shouldn't block Today.
    }
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function isCompleted(item: WalkOccurrence) {
  return item.status === "COMPLETED" || item.status === "COMPLETED_LATE";
}

function isWithinWindow(item: WalkOccurrence) {
  const now = Date.now();
  const start = new Date(item.windowStart).getTime();
  const end = new Date(item.graceEndsAt ?? item.dueAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return now >= start && now <= end;
}

function windowHasEnded(item: WalkOccurrence) {
  const end = new Date(item.graceEndsAt ?? item.dueAt).getTime();
  return Number.isFinite(end) && Date.now() > end;
}

function isReady(item: WalkOccurrence) {
  return (
    (item.status === "AVAILABLE" || item.status === "IN_PROGRESS") && isWithinWindow(item)
  );
}

function windowLabel(item: WalkOccurrence) {
  return `${formatTime(item.windowStart)} – ${formatTime(item.dueAt)}`;
}

type FilterKey = "open" | "in_progress" | "overdue" | "completed";

type BadgeTone = "pass" | "fail" | "pending" | "progress" | "sync" | "overdue";

function bucketFor(item: WalkOccurrence): FilterKey {
  if (isCompleted(item)) return "completed";
  if (item.status === "MISSED" || windowHasEnded(item)) return "overdue";
  if (item.status === "IN_PROGRESS") return "in_progress";
  return "open";
}

function completerLabel(item: WalkOccurrence): string {
  const name = (item.completedByName ?? item.startedByName ?? "").trim();
  if (!name) return "Completed";
  // Prefer first + last initial when the full name is long for the badge.
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && name.length > 14) {
    return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
  }
  return name.length > 16 ? `${name.slice(0, 15)}…` : name;
}

function badgeFor(
  item: WalkOccurrence,
  pendingSyncIds: Set<string>,
): { label: string; tone: BadgeTone } {
  if (pendingSyncIds.has(item.id)) return { label: "PENDING SYNC", tone: "sync" };
  const bucket = bucketFor(item);
  if (bucket === "completed") return { label: completerLabel(item), tone: "pass" };
  if (bucket === "overdue") return { label: "OVERDUE", tone: "overdue" };
  if (bucket === "in_progress") return { label: "IN PROGRESS", tone: "progress" };
  if (item.status === "UPCOMING") return { label: "UPCOMING", tone: "pending" };
  return { label: "OPEN", tone: "pending" };
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

export default function TodayScreen() {
  const { teamId } = useSession();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [today, setToday] = useState<WalkOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("open");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingSyncIds, setPendingSyncIds] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!teamId) return;
      setError(null);
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      const pendingDrafts = await listPendingSyncDrafts();
      setPendingSyncIds(
        new Set(
          pendingDrafts
            .filter((d) => d.teamId === teamId)
            .map((d) => d.occurrenceId),
        ),
      );
      try {
        const day = await listChecksForDay(teamId);
        setToday(day);
        await saveDayOccurrences(teamId, day);
        void prefetchReadyRuns(teamId, day);
      } catch (err) {
        const cached = await loadDayOccurrences(teamId);
        if (cached && cached.length > 0) {
          setToday(cached);
          setError("Showing saved checks — reconnect to refresh");
        } else {
          setToday([]);
          setError(err instanceof Error ? err.message : "Failed to load checks");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [teamId],
  );

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  const counts = useMemo(() => {
    const next: Record<FilterKey, number> = {
      open: 0,
      in_progress: 0,
      overdue: 0,
      completed: 0,
    };
    for (const item of today) next[bucketFor(item)] += 1;
    return next;
  }, [today]);

  const stats = useMemo(() => {
    const completed = counts.completed;
    return { completed, total: today.length };
  }, [counts.completed, today.length]);

  const progressPct =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const list = useMemo(() => {
    const filtered = today.filter((item) => bucketFor(item) === filter);
    const asc = filter === "completed" || filter === "overdue" ? -1 : 1;
    return filtered.sort(
      (a, b) =>
        asc * (new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
    );
  }, [today, filter]);

  function openCheck(item: WalkOccurrence) {
    const pendingSync = pendingSyncIds.has(item.id);
    if (!pendingSync && !isReady(item)) return;
    router.push(`/(app)/check/${item.id}`);
  }

  function renderRow(item: WalkOccurrence) {
    const pendingSync = pendingSyncIds.has(item.id);
    const ready = isReady(item) || pendingSync;
    const badge = badgeFor(item, pendingSyncIds);
    const badgeStyle =
      badge.tone === "pass"
        ? styles.badgePass
        : badge.tone === "overdue" || badge.tone === "fail"
          ? styles.badgeFail
          : badge.tone === "sync"
            ? styles.badgeSync
            : badge.tone === "progress"
              ? styles.badgeProgress
              : styles.badgePending;
    const badgeTextStyle =
      badge.tone === "pass"
        ? styles.badgeTextPass
        : badge.tone === "overdue" || badge.tone === "fail"
          ? styles.badgeTextFail
          : badge.tone === "sync"
            ? styles.badgeTextSync
            : badge.tone === "progress"
              ? styles.badgeTextProgress
              : styles.badgeTextPending;

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [
          styles.rowCard,
          pendingSync && styles.pendingSyncCard,
          pressed && ready && styles.pressed,
        ]}
        onPress={() => openCheck(item)}
        disabled={!ready}
      >
        <View
          style={[
            styles.rowIcon,
            badge.tone === "pass"
              ? { backgroundColor: colors.passSoft }
              : badge.tone === "overdue" || badge.tone === "fail"
                ? { backgroundColor: colors.failSoft }
                : { backgroundColor: colors.brandSoft },
          ]}
        >
          <Text
            style={[
              styles.rowIconGlyph,
              {
                color:
                  badge.tone === "pass"
                    ? colors.pass
                    : badge.tone === "overdue" || badge.tone === "fail"
                      ? colors.fail
                      : colors.brand,
              },
            ]}
          >
            {badge.tone === "pass" ? "✓" : badge.tone === "overdue" || badge.tone === "fail" ? "!" : "◷"}
          </Text>
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.template?.name ?? "Temperature check"}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {windowLabel(item)}
            {ready ? `  ·  Due ${formatTime(item.dueAt)}` : ""}
          </Text>
        </View>
        <View style={[styles.badge, badgeStyle, badge.tone === "pass" && styles.badgePerson]}>
          <Text
            style={[styles.badgeText, badgeTextStyle, badge.tone === "pass" && styles.badgeTextPerson]}
            numberOfLines={1}
          >
            {badge.label}
          </Text>
        </View>
        {ready ? <Text style={styles.chevron}>›</Text> : null}
      </Pressable>
    );
  }

  const emptyCopy: Record<FilterKey, { title: string; sub: string }> = {
    open: {
      title: "No open checks",
      sub: "When a check window opens and hasn’t been started, it shows up here.",
    },
    in_progress: {
      title: "Nothing in progress",
      sub: "Checks you’ve started will appear here until they’re finished.",
    },
    overdue: {
      title: "No overdue checks",
      sub: "Missed windows will show up in this list.",
    },
    completed: {
      title: "No completed checks yet",
      sub: "Finished walks will appear in this list.",
    },
  };

  return (
    <View style={styles.screen}>
      <AppTabHeader
        topInset={insets.top}
        logoAlign="left"
        onMenuPress={() => setMenuOpen(true)}
        testID="temps-checks-header"
      />
      <HomeMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingTitle}>Loading checks…</Text>
        </View>
      ) : (
        <>
          <View style={styles.topSticky}>
            <View style={styles.titleRow}>
              <Text style={styles.screenTitle}>Today’s Checks</Text>
              <Text style={styles.calGlyph}>▦</Text>
            </View>

            <View style={styles.filterGrid}>
              {FILTERS.map((item) => {
                const on = filter === item.key;
                return (
                  <Pressable
                    key={item.key}
                    style={({ pressed }) => [
                      styles.filterCard,
                      on && styles.filterCardOn,
                      pressed && styles.filterCardPressed,
                    ]}
                    onPress={() => setFilter(item.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    testID={`temps-filter-${item.key}`}
                  >
                    <Text style={[styles.filterCount, on && styles.filterCountOn]}>
                      {counts[item.key]}
                    </Text>
                    <Text style={[styles.filterLabel, on && styles.filterLabelOn]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.progressBlock}>
              <View style={styles.progressLabels}>
                <Text style={styles.progressLabel}>Overall Progress</Text>
                <Text style={styles.progressMeta}>
                  {stats.completed} of {stats.total} completed
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
              </View>
            </View>
          </View>

          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load("refresh")}
                tintColor={colors.brand}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {pendingSyncIds.size > 0 ? (
              <View style={styles.pendingSyncBanner}>
                <Text style={styles.pendingSyncBannerTitle}>Pending sync</Text>
                <Text style={styles.pendingSyncBannerBody}>
                  {pendingSyncIds.size === 1
                    ? "1 check finished on this device but hasn’t uploaded yet. Tap it to retry."
                    : `${pendingSyncIds.size} checks finished on this device but haven’t uploaded yet. Tap one to retry.`}
                </Text>
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>
              {FILTERS.find((f) => f.key === filter)?.label ?? "Checks"}
            </Text>

            {list.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{emptyCopy[filter].title}</Text>
                <Text style={styles.emptySub}>{emptyCopy[filter].sub}</Text>
              </View>
            ) : (
              <View style={styles.listGap}>{list.map((item) => renderRow(item))}</View>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.inkOnDark,
  },
  topSticky: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderDark,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.inkOnDark,
    letterSpacing: -0.4,
  },
  calGlyph: {
    fontSize: 20,
    color: colors.brand,
  },
  filterGrid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 14,
  },
  filterCard: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  filterCardOn: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  filterCardPressed: {
    opacity: 0.88,
  },
  filterCount: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.inkOnDark,
    letterSpacing: -0.3,
  },
  filterCountOn: {
    color: colors.brandDark,
  },
  filterLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: colors.mutedOnDark,
    textAlign: "center",
  },
  filterLabelOn: {
    color: colors.brandDark,
  },
  progressBlock: {
    gap: 8,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.inkOnDark,
  },
  progressMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedOnDark,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.brand,
    borderRadius: 999,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 24,
  },
  errorText: {
    color: colors.fail,
    marginBottom: 10,
    fontWeight: "600",
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.mutedOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  listGap: {
    gap: 10,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconGlyph: {
    fontSize: 16,
    fontWeight: "800",
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
    fontWeight: "500",
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgePass: { backgroundColor: colors.passSoft },
  badgeFail: { backgroundColor: colors.failSoft },
  badgeProgress: { backgroundColor: colors.brandSoft },
  badgePending: { backgroundColor: "#F1F4F9" },
  badgeSync: { backgroundColor: colors.warnSoft },
  badgePerson: {
    maxWidth: 96,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  badgeTextPass: { color: colors.pass },
  badgeTextFail: { color: colors.fail },
  badgeTextProgress: { color: colors.brandDark },
  badgeTextPending: { color: colors.muted },
  badgeTextSync: { color: "#B45309" },
  badgeTextPerson: {
    textTransform: "none",
    letterSpacing: 0,
    fontWeight: "700",
  },
  pendingSyncCard: {
    borderColor: colors.warn,
  },
  pendingSyncBanner: {
    backgroundColor: colors.warnSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F6D59A",
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  pendingSyncBannerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#B45309",
  },
  pendingSyncBannerBody: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.ink,
    lineHeight: 17,
  },
  chevron: {
    fontSize: 20,
    color: "#A8B3C5",
    fontWeight: "300",
  },
  emptyBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 22,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.inkOnDark,
  },
  emptySub: {
    marginTop: 6,
    fontSize: 12,
    color: colors.mutedOnDark,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.88,
  },
});
