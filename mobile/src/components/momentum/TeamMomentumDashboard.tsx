import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Polyline } from "react-native-svg";
import {
  Activity,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  Info,
  TrendingUp,
  Users,
} from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import {
  MOMENTUM_STRONG_STREAK,
  type TeamMomentumDashboardStats,
  type TeamMomentumLeaderSummary,
  type TeamMomentumRosterRow,
  type TeamMomentumWeekPoint,
} from "@/lib/team-momentum";

const PURPLE = "#5B45FF";
const GREEN = "#12B76A";
const ORANGE = "#F79009";
const RED = "#F04438";
const INK = "#101828";
const MUTED = "#667085";
const LINE = "#EEF2F7";

type Happening = {
  id: string;
  title: string;
  body: string;
  userId: string | null;
  tone: "good" | "watch" | "month";
};

function firstName(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.split(/\s+/)[0]! : "Someone";
}

export function momentumHappenings(
  rows: TeamMomentumRosterRow[],
  dashboard: TeamMomentumDashboardStats | undefined,
  coaching = true,
): Happening[] {
  const items: Happening[] = [];
  const active = rows
    .filter((row) => row.state === "strong" || row.state === "building")
    .sort((a, b) => b.member.currentStreak - a.member.currentStreak);
  const lead = active[0];
  if (lead && lead.member.currentStreak > 0) {
    items.push({
      id: `rhythm-${lead.member.userId}`,
      title: "In rhythm",
      body: `${firstName(lead.member.name)} is on a ${lead.member.currentStreak}-task run.`,
      userId: lead.member.userId,
      tone: "good",
    });
  }

  const close = rows
    .filter(
      (row) =>
        row.state === "building" &&
        row.member.currentStreak > 0 &&
        row.member.currentStreak < MOMENTUM_STRONG_STREAK &&
        row.member.userId !== lead?.member.userId,
    )
    .sort((a, b) => b.member.currentStreak - a.member.currentStreak)[0];
  if (close) {
    const remaining = MOMENTUM_STRONG_STREAK - close.member.currentStreak;
    items.push({
      id: `close-${close.member.userId}`,
      title: "Close",
      body: `${firstName(close.member.name)} is ${remaining === 1 ? "one task" : `${remaining} tasks`} away.`,
      userId: close.member.userId,
      tone: "watch",
    });
  }

  const steppedBack = coaching
    ? rows.filter((row) => row.state === "ready_to_rebuild")
    : [];
  const back =
    steppedBack.find(
      (row) => row.member.latestLateTaskTitle || row.member.latestLateTaskIncognito,
    ) ??
    steppedBack[0] ??
    rows.find((row) => row.state === "not_enough_activity");
  if (coaching && back) {
    const name = firstName(back.member.name);
    const title = back.member.latestLateTaskTitle?.trim();
    const body =
      back.state === "not_enough_activity"
        ? `${name} has not completed a task yet.`
        : back.member.latestLateTaskIncognito
          ? `A private task reset ${name}'s run.`
          : title
            ? `${title} reset ${name}'s run.`
            : `${name} has no current streak.`;
    items.push({
      id: `back-${back.member.userId}`,
      title: back.state === "not_enough_activity" ? "Not started" : "Stepped back",
      body,
      userId: back.member.userId,
      tone: "watch",
    });
  }

  if (items.length < 3 && dashboard) {
    items.push({
      id: "month-total",
      title: "This month",
      body: `${dashboard.onTimeCompletions} ${
        dashboard.onTimeCompletions === 1 ? "task was" : "tasks were"
      } completed on time.`,
      userId: null,
      tone: "month",
    });
  }
  return items.slice(0, 3);
}

function MountainArt() {
  return (
    <Svg width={150} height={108} viewBox="0 0 150 108">
      <Path d="M8 100 L58 36 L78 62 L112 14 L146 100 Z" fill="#DDD6FE" />
      <Path d="M78 100 L112 22 L146 100 Z" fill="#C4B5FD" />
      <Path
        d="M112 18 C106 40 102 58 98 82"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeDasharray="3 4"
        fill="none"
      />
      <Path d="M112 10 v14" stroke={PURPLE} strokeWidth={1.6} />
      <Path d="M112 10 h12 l-4 4 4 4 h-12 Z" fill={PURPLE} />
    </Svg>
  );
}

function ConsistencyChart({ weeks }: { weeks: TeamMomentumWeekPoint[] }) {
  const [width, setWidth] = useState(0);
  const height = 148;
  const padLeft = 32;
  const padRight = 8;
  const padTop = 12;
  const padBottom = 22;
  const innerW = Math.max(0, width - padLeft - padRight);
  const innerH = height - padTop - padBottom;
  const points = weeks.map((week, index) => {
    const rate = week.total === 0 ? null : week.onTime / week.total;
    const x = padLeft + (weeks.length <= 1 ? innerW / 2 : (innerW * index) / (weeks.length - 1));
    const y = rate == null ? null : padTop + innerH * (1 - rate);
    return { week, x, y, rate };
  });
  const line = points
    .filter((point) => point.y != null)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const last = [...points].reverse().find((point) => point.rate != null);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((mark) => {
          const y = padTop + innerH * (1 - mark);
          return (
            <Path
              key={mark}
              d={`M${padLeft} ${y} H${padLeft + innerW}`}
              stroke="#E8EDF5"
              strokeWidth={1}
            />
          );
        })}
        {line ? (
          <Polyline
            points={line}
            fill="none"
            stroke={PURPLE}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {last && last.y != null ? (
          <Circle cx={last.x} cy={last.y} r={4} fill={PURPLE} />
        ) : null}
      </Svg>
      <View style={styles.axisRow}>
        {points.map((point) => (
          <Text key={point.week.start} style={styles.axisLabel}>
            {new Date(point.week.start).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </Text>
        ))}
      </View>
      {last ? (
        <View style={[styles.chartTip, { left: Math.min(last.x, Math.max(0, width - 92)) }]}>
          <Text style={styles.chartTipValue}>{Math.round((last.rate ?? 0) * 100)}%</Text>
        </View>
      ) : (
        <Text style={styles.emptyChart}>No on-time completions this month yet.</Text>
      )}
    </View>
  );
}

function StatusDonut({
  onTime,
  dueSoon,
  overdue,
  showOverdue,
}: {
  onTime: number;
  dueSoon: number;
  overdue: number;
  showOverdue: boolean;
}) {
  const total = onTime + dueSoon + overdue;
  const size = 112;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const slices = [
    { key: "on-time", value: onTime, color: GREEN },
    { key: "due-soon", value: dueSoon, color: ORANGE },
    { key: "overdue", value: overdue, color: RED },
  ];
  let consumed = 0;
  return (
    <View style={styles.donutRow}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#EEF2F7"
            strokeWidth={stroke}
            fill="none"
          />
          {total > 0
            ? slices.map((slice) => {
                const length = (slice.value / total) * circumference;
                const start = consumed;
                consumed += slice.value;
                if (slice.value <= 0) return null;
                return (
                  <Circle
                    key={slice.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={slice.color}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-((start / total) * circumference)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  />
                );
              })
            : null}
        </Svg>
        <View style={styles.donutCenter}>
          <Text style={styles.donutValue}>{total}</Text>
          <Text style={styles.donutCaption}>total tasks</Text>
        </View>
      </View>
      <View style={styles.legend}>
        <LegendRow color={GREEN} label="On time" value={onTime} total={total} />
        <LegendRow color={ORANGE} label="Due soon" value={dueSoon} total={total} />
        {showOverdue ? (
          <LegendRow color={RED} label="Overdue" value={overdue} total={total} />
        ) : null}
      </View>
    </View>
  );
}

function LegendRow({
  color,
  label,
  value,
  total,
}: {
  color: string;
  label: string;
  value: number;
  total: number;
}) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>
        {value} {label}
      </Text>
      <Text style={styles.legendPercent}>{percent}%</Text>
    </View>
  );
}

function StatCard({
  icon,
  value,
  label,
  detail,
  detailColor,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  detail?: string;
  detailColor?: string;
}) {
  return (
    <View style={[styles.card, styles.statCard]}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {detail ? (
        <Text style={[styles.statDetail, detailColor ? { color: detailColor } : null]}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

export function TeamMomentumDashboard({
  summary,
  rows,
  wide,
  coaching = true,
  canOpenMember,
  onOpenMember,
  onOpenInfo,
}: {
  summary: TeamMomentumLeaderSummary;
  rows: TeamMomentumRosterRow[];
  wide: boolean;
  coaching?: boolean;
  canOpenMember?: (userId: string) => boolean;
  onOpenMember: (userId: string) => void;
  onOpenInfo: () => void;
}) {
  const dashboard = summary.dashboard;
  const percent =
    summary.eligibleCount === 0
      ? 0
      : Math.round((summary.activeCount / summary.eligibleCount) * 100);
  const members = [...rows].sort(
    (a, b) =>
      b.member.currentStreak - a.member.currentStreak ||
      (a.member.name || "").localeCompare(b.member.name || ""),
  );
  const onTimeCompletions =
    dashboard?.onTimeCompletions ??
    members.reduce((sum, row) => sum + row.member.completedThisMonth, 0);
  const overdue =
    dashboard?.taskStatus.overdue ??
    members.reduce((sum, row) => sum + row.member.overdueTaskCount, 0);
  const change = dashboard?.onTimeChangePercent;
  const changeLabel =
    change == null
      ? undefined
      : `${change > 0 ? "+" : ""}${change}% vs. last month`;
  const happenings = momentumHappenings(rows, dashboard, coaching);
  const visibleOverdue = coaching ? overdue : 0;

  const hero = (
    <View style={[styles.card, styles.hero]}>
      <View style={styles.heroCopy}>
        <View style={styles.flame}>
          <Flame size={18} color="#F97316" fill="#FDBA74" />
        </View>
        <Text style={styles.heroPercent}>{percent}%</Text>
        <Text style={styles.heroBody}>
          of your team has an active on-time task streak
        </Text>
        <Text style={styles.heroMeta}>
          {summary.activeCount} of {summary.eligibleCount}{" "}
          {summary.eligibleCount === 1 ? "member" : "members"}
        </Text>
      </View>
      <MountainArt />
    </View>
  );

  const stats = (
    <>
      <StatCard
        icon={<Check size={16} color={GREEN} strokeWidth={2.6} />}
        value={String(onTimeCompletions)}
        label="on-time completions"
        detail={changeLabel}
        detailColor={change != null && change < 0 ? RED : GREEN}
      />
      {coaching ? (
        <StatCard
          icon={<Clock3 size={16} color={ORANGE} strokeWidth={2.4} />}
          value={String(overdue)}
          label="overdue tasks"
        />
      ) : null}
      <StatCard
        icon={<Users size={16} color={PURPLE} strokeWidth={2.4} />}
        value={String(summary.activeCount)}
        label="active streaks"
        detail={`${percent}% of team`}
        detailColor={MUTED}
      />
    </>
  );

  return (
    <View style={styles.stack} testID="team-momentum-dashboard">
      <View style={wide ? styles.heroRow : styles.stack}>
        <View style={wide ? styles.heroSlot : undefined}>{hero}</View>
        <View style={wide ? styles.statRow : styles.statRow}>
          {stats}
        </View>
      </View>

      <View style={wide ? styles.chartRow : styles.stack}>
        <View style={[styles.card, styles.chartCard, wide ? styles.flex : undefined]}>
          <Text style={styles.cardTitle}>On-Time Consistency</Text>
          <Text style={styles.cardSubtitle}>Percent of team tasks completed on time</Text>
          {dashboard?.weeks?.length ? (
            <ConsistencyChart weeks={dashboard.weeks} />
          ) : (
            <Text style={styles.emptyChart}>
              The weekly line appears once this month's summary includes it.
            </Text>
          )}
        </View>
        <View style={[styles.card, styles.chartCard, wide ? styles.flex : undefined]}>
          <Text style={styles.cardTitle}>Task Status</Text>
          <Text style={styles.cardSubtitle}>All team tasks this month</Text>
          <StatusDonut
            onTime={dashboard?.taskStatus.onTime ?? onTimeCompletions}
            dueSoon={dashboard?.taskStatus.dueSoon ?? 0}
            overdue={visibleOverdue}
            showOverdue={coaching}
          />
        </View>
        <View style={[styles.card, styles.chartCard, wide ? styles.flex : undefined]}>
          <Text style={styles.cardTitle}>Team Members</Text>
          {members.length === 0 ? (
            <Text style={styles.emptyChart}>
              Momentum will appear as members complete assigned tasks.
            </Text>
          ) : (
            members.map((row) => {
              const streak = row.state === "not_enough_activity" ? 0 : row.member.currentStreak;
              const filled = Math.min(streak, MOMENTUM_STRONG_STREAK);
              const dot = streak > 0 ? GREEN : "#CBD5E1";
              const openable = canOpenMember?.(row.member.userId) !== false;
              return (
                <Pressable
                  key={row.member.userId}
                  disabled={!openable}
                  onPress={() => onOpenMember(row.member.userId)}
                  style={styles.memberRow}
                  accessibilityRole={openable ? "button" : "text"}
                  accessibilityLabel={`${row.member.name}. ${streak > 0 ? `Current streak ${streak}` : "No current streak"}. ${row.member.completedThisMonth} this month.`}
                >
                  <UserAvatar
                    user={{
                      name: row.member.name,
                      email: row.member.email,
                      image: row.member.image,
                    }}
                    size={36}
                    radius={18}
                    backgroundColor="#EEF2FF"
                  />
                  <View style={styles.memberCopy}>
                    <View style={styles.memberNameRow}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {row.member.name || row.member.email || "Member"}
                      </Text>
                      <View style={[styles.presence, { backgroundColor: dot }]} />
                    </View>
                    <Text style={styles.memberMeta}>
                      {streak > 0 ? `Current streak: ${streak}` : "No current streak"}
                    </Text>
                    <View style={styles.pips}>
                      {Array.from({ length: MOMENTUM_STRONG_STREAK }, (_, index) => (
                        <View
                          key={index}
                          style={[
                            styles.pip,
                            index < filled ? styles.pipFilled : styles.pipEmpty,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.monthCount}>
                    {row.member.completedThisMonth}{"\n"}this month
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What's Happening</Text>
        <Text style={styles.cardSubtitle}>A quick look at your team's momentum.</Text>
        <View style={wide ? styles.happeningRow : styles.stack}>
          {happenings.length === 0 ? (
            <Text style={styles.emptyChart}>Nothing to flag this month.</Text>
          ) : (
            happenings.map((item) => {
              const Icon =
                item.tone === "good" ? TrendingUp : item.tone === "month" ? Activity : Users;
              const color = item.tone === "good" ? GREEN : item.tone === "month" ? PURPLE : ORANGE;
              const surface = item.tone === "good" ? "#ECFDF3" : item.tone === "month" ? "#F4F0FF" : "#FFFAEB";
              const openable = !!item.userId && canOpenMember?.(item.userId) !== false;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    if (item.userId) onOpenMember(item.userId);
                  }}
                  disabled={!openable}
                  style={[styles.happeningCard, wide ? styles.flex : undefined]}
                >
                  <View style={[styles.happeningIcon, { backgroundColor: surface }]}>
                    <Icon size={16} color={color} strokeWidth={2.3} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.happeningTitle}>{item.title}</Text>
                    <Text style={styles.happeningBody}>{item.body}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </View>

      <Pressable
        onPress={onOpenInfo}
        style={styles.infoBar}
        accessibilityRole="button"
        accessibilityLabel="How momentum works"
      >
        <Info size={16} color={MUTED} strokeWidth={2.2} />
        <View style={styles.flex}>
          <Text style={styles.infoTitle}>How momentum works</Text>
          <Text style={styles.infoBody}>
            Momentum is on-time task completions in a row. A late task resets the run and keeps the personal best.
          </Text>
        </View>
        <ChevronRight size={16} color="#98A2B3" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  heroRow: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  heroSlot: { flex: 1.35, minWidth: 0 },
  statRow: { flex: 1, flexDirection: "row", gap: 12 },
  chartRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    padding: 14,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F4F0FF",
    minHeight: 132,
    gap: 8,
  },
  heroCopy: { flex: 1, minWidth: 0 },
  flame: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
    marginBottom: 6,
  },
  heroPercent: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.6,
  },
  heroBody: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: "600", color: "#344054" },
  heroMeta: { marginTop: 4, fontSize: 12, color: MUTED },
  statCard: { flex: 1, minWidth: 0, gap: 2 },
  statValue: { marginTop: 8, fontSize: 22, lineHeight: 26, fontWeight: "800", color: INK },
  statLabel: { fontSize: 12, lineHeight: 16, color: MUTED },
  statDetail: { marginTop: 4, fontSize: 11, fontWeight: "700", color: GREEN },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800", color: INK },
  cardSubtitle: { marginTop: 2, marginBottom: 8, fontSize: 12, lineHeight: 16, color: MUTED },
  chartCard: { gap: 0 },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -4 },
  axisLabel: { fontSize: 10, color: "#98A2B3" },
  chartTip: { position: "absolute", top: 36, backgroundColor: "#FFFFFF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: LINE },
  chartTipValue: { fontSize: 12, fontWeight: "800", color: INK },
  emptyChart: { paddingVertical: 18, fontSize: 13, lineHeight: 18, color: MUTED },
  donutRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  donutCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  donutValue: { fontSize: 18, fontWeight: "800", color: INK },
  donutCaption: { fontSize: 10, color: MUTED },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 12, color: "#344054" },
  legendPercent: { fontSize: 12, color: MUTED },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  memberCopy: { flex: 1, minWidth: 0 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  memberName: { flexShrink: 1, fontSize: 14, fontWeight: "700", color: INK },
  presence: { width: 7, height: 7, borderRadius: 4 },
  memberMeta: { marginTop: 1, fontSize: 11, color: MUTED },
  pips: { flexDirection: "row", gap: 4, marginTop: 4 },
  pip: { width: 8, height: 8, borderRadius: 4 },
  pipFilled: { backgroundColor: PURPLE },
  pipEmpty: { backgroundColor: "#E4E7EC" },
  monthCount: { fontSize: 11, lineHeight: 14, color: MUTED, textAlign: "right" },
  happeningRow: { flexDirection: "row", gap: 10 },
  happeningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 14,
    padding: 12,
  },
  happeningIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  happeningTitle: { fontSize: 13, fontWeight: "800", color: INK },
  happeningBody: { marginTop: 2, fontSize: 12, lineHeight: 16, color: MUTED },
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoTitle: { fontSize: 13, fontWeight: "800", color: INK },
  infoBody: { marginTop: 2, fontSize: 12, lineHeight: 16, color: MUTED },
});
