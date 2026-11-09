import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  SquareCheckBig,
  SquareArrowOutUpRight,
} from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import {
  TODAY_ITEM_ACTION,
  TODAY_ITEM_PRESENTATION,
  editTodayItem,
  isTaskLike,
  overdueLabel,
  todayItemHasClock,
} from "@/lib/home-today-item";
import { instantHasPassed, scheduleTimeParts } from "@/lib/schedule-time";
import type { CalendarEvent, HomeTodayItem, Task } from "@/lib/types";
import { EventPreviewSheet } from "@/components/workspace/EventPreviewSheet";
import { TaskPreviewSheet } from "@/components/workspace/TaskPreviewSheet";
import { isFeedbackTaskDescription } from "@/lib/one-on-one-feedback";
import { isReminderTask } from "@/lib/task-kind";
import { videoCallHref } from "@/lib/meeting-navigation";
import { cardSurface } from "@/components/home/home-card-styles";
import { useTeamStore } from "@/lib/state/team-store";

type Props = {
  items: HomeTodayItem[];
  pending: boolean;
  onInfo?: () => void;
  variant?: "default" | "alenio";
  /**
   * Wide layout. The card fills the height of the network and insight
   * cards beside it. Items scroll inside once they pass that height.
   */
  fill?: boolean;
};

type RowState = "past" | "late" | "next" | "later";
type Lane = "past" | "late" | "open";

const PURPLE = "#6D5EF8";
const BLUE = "#3B6CFF";
const LATE = "#9F1239";
const MARKER_TOP = 16;
const MARKER_SIZE = 16;
const MARKER_CENTER = MARKER_TOP + MARKER_SIZE / 2;
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function easeTodayList() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

/** On a phone the card shows this many rows, then the rest scroll. */
const VISIBLE_ROWS = 3;
const ROW_FALLBACK = 72;

export function HomeTodayCard({
  items,
  pending,
  fill = false,
  variant = "default",
}: Props) {
  const queryClient = useQueryClient();
  const [menuItem, setMenuItem] = useState<HomeTodayItem | null>(null);
  const [confirmItem, setConfirmItem] = useState<HomeTodayItem | null>(null);
  const [justDoneId, setJustDoneId] = useState<string | null>(null);
  const [previewEvent, setPreviewEvent] = useState<CalendarEvent | null>(null);
  const [previewTask, setPreviewTask] = useState<Task | null>(null);
  const previewRequest = useRef<string | null>(null);
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const [moreBelow, setMoreBelow] = useState(false);
  const scrollMetrics = useRef({ y: 0, view: 0, content: 0 });
  const now = Date.now();
  const lanes = items.map((item) => laneFor(item, now));
  const byTime = (a: HomeTodayItem, b: HomeTodayItem) =>
    new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
  const held = (item: HomeTodayItem) => item.id === justDoneId;
  const active = items
    .filter((item, index) => lanes[index] !== "past" || held(item))
    .sort(byTime);
  const activeLanes = active.map((item) =>
    item.id === justDoneId ? ("past" as const) : laneFor(item, now),
  );
  const nextIndex = nextUpIndex(active, activeLanes, now);
  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const completeMutation = useMutation({
    mutationFn: (item: HomeTodayItem) =>
      api.patchFull<Task>(
        `/api/teams/${item.workspace?.id}/tasks/${item.id}`,
        { status: "done" },
      ),
    onSuccess: (_result, item) => {
      invalidateTaskCaches(queryClient, item.workspace?.id);
    },
    onError: (error) => {
      easeTodayList();
      setJustDoneId(null);
      Alert.alert(
        "Couldn't complete that",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    },
  });

  useEffect(() => {
    if (!justDoneId) return;
    const timer = setTimeout(() => {
      easeTodayList();
      setJustDoneId(null);
    }, 900);
    return () => clearTimeout(timer);
  }, [justDoneId]);

  const closeMenu = () => setMenuItem(null);
  const closePreview = () => {
    previewRequest.current = null;
    setPreviewEvent(null);
    setPreviewTask(null);
  };
  const openScheduleItem = (item: HomeTodayItem) => {
    if (isTaskLike(item)) {
      const draft = previewFromTodayTask(item);
      previewRequest.current = item.id;
      setPreviewEvent(null);
      setPreviewTask(draft);
      const teamId = item.workspace?.id;
      if (!teamId) return;
      void queryClient
        .fetchQuery({
          queryKey: ["task", item.id, teamId],
          queryFn: () => api.get<Task>(`/api/teams/${teamId}/tasks/${item.id}`),
        })
        .then((task) => {
          if (previewRequest.current !== item.id) return;
          setPreviewTask(task);
        })
        .catch(() => {});
      return;
    }
    setPreviewTask(null);
    const draft = previewFromTodayItem(item);
    previewRequest.current = item.id;
    setPreviewEvent(draft);
    const teamId = item.workspace?.id;
    if (!teamId || item.type === "external" || item.type === "holiday") return;
    void queryClient
      .fetchQuery({
        queryKey: ["calendar-events", teamId],
        queryFn: () => api.get<CalendarEvent[]>(`/api/teams/${teamId}/events`),
      })
      .then((events) => {
        if (previewRequest.current !== item.id) return;
        const found = events.find((event) => event.id === item.id);
        if (found) setPreviewEvent(found);
      })
      .catch(() => {});
  };
  const displayKeys = [
    ...active.map((item) => `${item.type}-${item.id}`),
  ];
  const overflow = displayKeys.length > VISIBLE_ROWS;
  const scrolls = fill || overflow;
  const visibleKeys = displayKeys.slice(0, VISIBLE_ROWS);
  const measuredHeights = visibleKeys.map((key) => rowHeights[key]);
  const listMaxHeight = measuredHeights.every((height) => height != null)
    ? measuredHeights.reduce((sum, height) => sum + (height ?? 0), 0) + 8
    : VISIBLE_ROWS * ROW_FALLBACK;
  const noteRowHeight = (key: string, height: number) => {
    const next = Math.round(height);
    setRowHeights((current) =>
      current[key] === next ? current : { ...current, [key]: next },
    );
  };
  const noteScroll = (patch: { y?: number; view?: number; content?: number }) => {
    const next = { ...scrollMetrics.current, ...patch };
    scrollMetrics.current = next;
    if (next.view <= 0 || next.content <= 0) return;
    const more =
      next.content > next.view + 12 && next.y + next.view < next.content - 12;
    setMoreBelow((current) => (current === more ? current : more));
  };
  const itemRow = (item: HomeTodayItem, index: number, isLast: boolean) => {
    const celebrate = item.id === justDoneId;
    const lane = activeLanes[index];
    const state: RowState =
      celebrate
        ? "past"
        : lane === "late"
          ? "late"
          : index === nextIndex
            ? "next"
            : "later";
    const key = `${item.type}-${item.id}`;
    return (
      <TodayRow
        key={key}
        item={item}
        state={state}
        isLast={isLast}
        celebrate={celebrate}
        onOpen={() => openScheduleItem(item)}
        onMenu={() => setMenuItem(item)}
        onHeight={(height) => noteRowHeight(key, height)}
      />
    );
  };
  const lastKey = displayKeys[displayKeys.length - 1];
  const timelineRows = active.map((item, index) =>
    itemRow(item, index, `${item.type}-${item.id}` === lastKey),
  );

  if (!pending && active.length === 0) {
    return <EmptyTodayCard fill={fill} />;
  }

  return (
    <View
      style={[
        styles.card,
        variant === "alenio" ? styles.cardAlenio : null,
        fill ? styles.cardWide : null,
      ]}
      testID="home-today-section"
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <CalendarDays size={16} color={PURPLE} strokeWidth={2.2} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>
            Today
          </Text>
          <Text style={styles.date} numberOfLines={1}>
            {dateLabel}
          </Text>
        </View>
      </View>

      {pending ? null : active.length > 0 ? (
        <View style={fill ? styles.timelineFill : undefined}>
            {scrolls ? (
              <ScrollView
                style={fill ? styles.timelineScroll : { maxHeight: listMaxHeight }}
                contentContainerStyle={styles.timeline}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onLayout={(event) =>
                  noteScroll({ view: event.nativeEvent.layout.height })
                }
                onContentSizeChange={(_width, height) =>
                  noteScroll({ content: height })
                }
                onScroll={(event) => {
                  const { contentOffset, contentSize, layoutMeasurement } =
                    event.nativeEvent;
                  noteScroll({
                    y: contentOffset.y,
                    view: layoutMeasurement.height,
                    content: contentSize.height,
                  });
                }}
                testID="home-today-list"
              >
                {timelineRows}
              </ScrollView>
            ) : (
              <View style={styles.timeline} testID="home-today-list">
                {timelineRows}
              </View>
            )}
            {scrolls && moreBelow ? (
              <View pointerEvents="none" style={styles.moreCue}>
                <View style={styles.moreCircle} accessibilityLabel="More on today's schedule">
                  <ChevronDown size={16} color={PURPLE} strokeWidth={2.6} />
                </View>
              </View>
            ) : null}
        </View>
      ) : null}

      {fill ? <Hills /> : null}

      <AlenioBottomSheet
        visible={!!menuItem}
        title={menuItem?.title ?? ""}
        subtitle={
          menuItem
            ? TODAY_ITEM_PRESENTATION[menuItem.type].label +
              (menuItem.workspace ? ` · ${menuItem.workspace.name}` : "")
            : undefined
        }
        onClose={closeMenu}
        compact
        showCloseButton
      >
        {menuItem && isTaskLike(menuItem) && menuItem.workspace ? (
          <AlenioSheetOption
            icon={<Check size={15} color="#FFFFFF" strokeWidth={2.6} />}
            iconColor="#0F9D6E"
            tint="slate"
            title="Mark complete"
            onPress={() => {
              const item = menuItem;
              setMenuItem(null);
              if (item) setConfirmItem(item);
            }}
            testID="home-today-complete"
          />
        ) : null}
        <AlenioSheetOption
          icon={
            <SquareArrowOutUpRight
              size={15}
              color="#FFFFFF"
              strokeWidth={2.3}
            />
          }
          title={menuItem ? TODAY_ITEM_ACTION[menuItem.type] : "Open"}
          onPress={() => {
            const item = menuItem;
            setMenuItem(null);
            if (item) openScheduleItem(item);
          }}
          testID="home-today-open"
        />
        {menuItem && isTaskLike(menuItem) ? (
          <AlenioSheetOption
            icon={<Pencil size={15} color="#FFFFFF" strokeWidth={2.3} />}
            tint="purple"
            iconColor="#6947E8"
            title="Edit"
            onPress={() => {
              const item = menuItem;
              setMenuItem(null);
              if (item) editTodayItem(item);
            }}
            testID="home-today-edit"
          />
        ) : null}
      </AlenioBottomSheet>
      <EventPreviewSheet
        visible={!!previewEvent}
        event={previewEvent}
        onClose={closePreview}
        onJoin={
          previewEvent?.isVideoMeeting
            ? () => {
                const event = previewEvent;
                closePreview();
                router.push(videoCallHref(event.id, event.title));
              }
            : undefined
        }
      />
      <TaskPreviewSheet
        visible={!!previewTask}
        task={previewTask}
        onClose={closePreview}
        onEdit={
          previewTask
            ? () => {
                const task = previewTask;
                closePreview();
                router.push({
                  pathname: "/task-detail",
                  params: {
                    taskId: task.id,
                    teamId: task.teamId,
                    ...(isFeedbackTaskDescription(task.description)
                      ? {}
                      : { startEdit: "1" }),
                  },
                });
              }
            : undefined
        }
        onComplete={
          previewTask &&
          previewTask.status !== "done" &&
          !isFeedbackTaskDescription(previewTask.description)
            ? () => {
                const task = previewTask;
                closePreview();
                setConfirmItem({
                  id: task.id,
                  type: isReminderTask(task) ? "reminder" : "task",
                  title: task.title,
                  startAt: task.dueDate ?? new Date().toISOString(),
                  endAt: null,
                  allDay: false,
                  workspace: { id: task.teamId, name: "" },
                });
              }
            : undefined
        }
      />
      <AlenioBottomSheet
        visible={confirmItem != null}
        title={`Complete ${confirmItem?.type === "reminder" ? "reminder" : "task"}?`}
        subtitle="This will move it to completed"
        onClose={() => {
          if (completeMutation.isPending) return;
          setConfirmItem(null);
        }}
        compact
        showCloseButton
        testID="home-today-complete-confirm"
        footer={
          <View style={{ gap: 4 }}>
            <Pressable
              onPress={() => {
                const item = confirmItem;
                if (!item || completeMutation.isPending) return;
                setConfirmItem(null);
                easeTodayList();
                setJustDoneId(item.id);
                completeMutation.mutate(item);
              }}
              disabled={completeMutation.isPending}
              style={[
                alenioSheetStyles.primaryButton,
                {
                  backgroundColor:
                    confirmItem?.type === "reminder" ? "#635BDB" : "#16A36A",
                  opacity: completeMutation.isPending ? 0.65 : 1,
                },
              ]}
              testID="home-today-complete-yes"
            >
              {completeMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  {`Complete ${confirmItem?.type === "reminder" ? "reminder" : "task"}`}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setConfirmItem(null)}
              disabled={completeMutation.isPending}
              style={alenioSheetStyles.cancelButton}
              testID="home-today-complete-cancel"
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        }
      >
        {confirmItem ? (
          <AlenioSheetCard
            tint={confirmItem.type === "reminder" ? "purple" : "slate"}
            compact
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    confirmItem.type === "reminder" ? "#E9E5FF" : "#E7F7F0",
                }}
              >
                {confirmItem.type === "reminder" ? (
                  <Bell size={17} color="#635BDB" strokeWidth={2.2} />
                ) : (
                  <SquareCheckBig size={17} color="#15805D" strokeWidth={2.2} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 13.5,
                    lineHeight: 18,
                    fontWeight: "700",
                    color: "#172033",
                  }}
                  numberOfLines={2}
                >
                  {confirmItem.title}
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontSize: 10.5,
                    lineHeight: 14,
                    color: "#7C8799",
                  }}
                >
                  {confirmItem.type === "reminder" ? "Private reminder" : "Workspace task"}
                </Text>
              </View>
            </View>
          </AlenioSheetCard>
        ) : null}
      </AlenioBottomSheet>
    </View>
  );
}

function todayDateLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function todayIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function EmptyTodayCard({ fill = false }: { fill?: boolean }) {
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const addToToday = () => {
    if (!activeTeamId) return;
    router.push({
      pathname: "/create-task",
      params: {
        teamId: activeTeamId,
        initialDueDate: todayIsoDate(),
        kind: "reminder",
      },
    });
  };

  if (fill) {
    return (
      <View style={styles.emptyTall} testID="home-today-empty">
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <CalendarDays size={16} color={PURPLE} strokeWidth={2.2} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title} numberOfLines={1}>
              Today
            </Text>
            <Text style={styles.date} numberOfLines={1}>
              {todayDateLabel()}
            </Text>
          </View>
        </View>
        <View style={styles.emptyTallBody}>
          <View style={styles.emptyMark}>
            <CalendarCheck size={26} color={PURPLE} strokeWidth={2.1} />
          </View>
          <Text style={styles.emptyCaughtTitle}>You're all caught up</Text>
          <Text style={styles.emptyCaughtBody}>
            No activities or check-ins scheduled for today.
          </Text>
          <Pressable
            onPress={addToToday}
            style={styles.emptyAdd}
            accessibilityRole="button"
            accessibilityLabel="Add to today"
            testID="home-today-add"
          >
            <Plus size={14} color={PURPLE} strokeWidth={2.4} />
            <Text style={styles.emptyAddText}>Add to today</Text>
          </Pressable>
        </View>
        <Hills />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={["#FBFAFF", "#F5F1FF", "#EEE9FF"]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.emptyCard}
      testID="home-today-empty"
    >
      <View style={styles.emptyCalendar}>
        <CalendarDays size={15} color={PURPLE} strokeWidth={2.2} />
      </View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>Today</Text>
        <Text style={styles.emptyText}>Your day is clear</Text>
      </View>
      <View pointerEvents="none" style={styles.emptyArtwork}>
        <Svg width="100%" height="100%" viewBox="0 0 132 62">
          <Path
            d="M2 62 C18 57 25 47 38 43 C48 49 54 54 62 56 C72 51 82 31 94 28 C104 39 113 52 130 57 L132 62 Z"
            fill="#DCD2FF"
            opacity={0.58}
          />
          <Path
            d="M18 62 C35 57 46 48 57 51 C66 55 72 58 80 58 C89 50 99 42 107 43 C116 50 122 56 132 58 L132 62 Z"
            fill="#BCA9FF"
            opacity={0.46}
          />
        </Svg>
        <View style={styles.emptyCheck}>
          <Check size={14} color="#FFFFFF" strokeWidth={2.8} />
        </View>
      </View>
    </LinearGradient>
  );
}

/** Height of the hills strip at the bottom of the wide Today card. The list stops above it. */
const HILLS_HEIGHT = 72;
/** The list may run this far into the hills box: the wave crest sits lower than its top edge. */
const HILLS_OVERLAP = 12;

/** Soft lavender hills pinned to the bottom of the wide Today card. */
function Hills() {
  return (
    <View pointerEvents="none" style={styles.hills}>
      <Svg width="100%" height="100%" viewBox="0 0 360 90" preserveAspectRatio="none">
        <Path
          d="M0 58 C40 46 70 70 120 62 C170 54 200 28 250 34 C300 40 330 58 360 48 L360 90 L0 90 Z"
          fill="#E7E0FF"
          opacity={0.85}
        />
        <Path
          d="M0 72 C50 60 90 78 150 70 C210 62 250 48 300 56 C330 62 348 68 360 64 L360 90 L0 90 Z"
          fill="#D9CFFF"
          opacity={0.7}
        />
      </Svg>
    </View>
  );
}

function previewFromTodayTask(item: HomeTodayItem): Task {
  return {
    id: item.id,
    kind: item.type === "reminder" ? "reminder" : "workspace_task",
    title: item.title,
    status: item.done ? "done" : "todo",
    priority: item.priority ?? "medium",
    dueDate: item.startAt,
    createdAt: item.startAt,
    updatedAt: item.startAt,
    teamId: item.workspace?.id ?? "",
    creatorId: "",
    creator: { id: "", name: "", email: "" },
    assignments: [],
    subtasks: [],
  };
}

function previewFromTodayItem(item: HomeTodayItem): CalendarEvent {
  return {
    id: item.id,
    title: item.title,
    startDate: item.startAt,
    endDate: item.endAt,
    allDay: item.allDay,
    color: "#5B45FF",
    teamId: item.workspace?.id ?? "",
    createdAt: item.startAt,
    isVideoMeeting: item.type === "meeting",
    isOneOnOne: item.type === "check_in",
    isExternal: item.type === "external",
  };
}

function isItemOver(item: HomeTodayItem, now: number) {
  if (item.overdue || isTaskLike(item)) return false;
  const end = new Date(item.endAt ?? item.startAt).getTime();
  return Number.isFinite(end) && end < now;
}

function laneFor(item: HomeTodayItem, now: number): Lane {
  if (item.done) return "past";
  if (item.overdue || taskPastDue(item, now)) return "late";
  if (isItemOver(item, now)) return "past";
  return "open";
}

/** An open task whose due date and time have both passed. */
function taskPastDue(item: HomeTodayItem, now: number): boolean {
  return (
    isTaskLike(item) &&
    !item.done &&
    !item.allDay &&
    instantHasPassed(item.startAt, new Date(now))
  );
}

/** The next item that still has a clock time ahead. A day-only task waits behind those. */
function nextUpIndex(items: HomeTodayItem[], lanes: Lane[], now: number) {
  const hasClock = (index: number) => {
    const item = items[index];
    return !!item && todayItemHasClock(item);
  };
  const upcoming = lanes.findIndex(
    (lane, index) =>
      lane === "open" &&
      hasClock(index) &&
      new Date(items[index]!.startAt).getTime() >= now,
  );
  if (upcoming >= 0) return upcoming;
  const timed = lanes.findIndex((lane, index) => lane === "open" && hasClock(index));
  if (timed >= 0) return timed;
  return lanes.findIndex((lane) => lane === "open");
}

function timeParts(item: HomeTodayItem) {
  return scheduleTimeParts({
    at: item.startAt,
    allDay: item.allDay,
    taskLike: isTaskLike(item),
    done: false,
  });
}

function durationLabel(item: HomeTodayItem) {
  if (!item.endAt) return null;
  const minutes = Math.round(
    (new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60000,
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hr" : `${hours} hr`;
  }
  return `${minutes} min`;
}

function metaLine(item: HomeTodayItem, now = Date.now()) {
  const parts = [
    ...(item.workspace?.name ? [item.workspace.name] : []),
    TODAY_ITEM_PRESENTATION[item.type].label,
  ];
  if (item.overdue || (isTaskLike(item) && taskPastDue(item, now))) {
    return {
      line: "",
      late: item.overdue ? overdueLabel(item) : "Overdue",
    };
  }
  const duration = durationLabel(item);
  if (duration) parts.push(duration);
  return {
    line: parts.join(" · "),
    late: taskPastDue(item, now) ? "Overdue" : (null as string | null),
  };
}

function TodayRow({
  item,
  state,
  isLast,
  celebrate = false,
  onOpen,
  onMenu,
  onHeight,
}: {
  item: HomeTodayItem;
  state: RowState;
  isLast: boolean;
  celebrate?: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onHeight: (height: number) => void;
}) {
  const time = timeParts(item);
  const meta = metaLine(item, Date.now());
  const late = celebrate ? null : meta.late;
  const timeLabel =
    state === "late"
      ? new Date(item.startAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : time.sub
        ? `${time.main} ${time.sub}`
        : time.main;
  const done = state === "past" || celebrate;
  const dotColor = state === "next" ? BLUE : state === "later" ? PURPLE : "#D0D5DD";
  const ItemTypeIcon = TODAY_ITEM_PRESENTATION[item.type].Icon;

  return (
    <View
      style={[styles.row, isLast ? styles.rowLast : null]}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
    >
      <View style={styles.timeCol}>
        <Text style={[styles.timeMain, done ? styles.timePast : null]}>
          {timeLabel}
        </Text>
      </View>
      <View style={styles.rail}>
        {isLast ? null : <View style={styles.railLine} />}
        <View style={styles.markerSlot}>
          {state === "late" ? (
            <View style={styles.lateDot} />
          ) : done && isTaskLike(item) ? (
            <View style={styles.timelineCheck}>
              <Check size={10} color="#FFFFFF" strokeWidth={3} />
            </View>
          ) : (
            <View style={[styles.dot, { backgroundColor: done ? "#D0D5DD" : dotColor }]} />
          )}
        </View>
      </View>
      <View style={styles.rowBody}>
        <Pressable
          onPress={onOpen}
          style={styles.itemCard}
          accessibilityRole="button"
          accessibilityLabel={
            late
              ? `${TODAY_ITEM_PRESENTATION[item.type].label}, overdue: ${item.title}`
              : celebrate
                ? `${TODAY_ITEM_PRESENTATION[item.type].label} complete: ${item.title}`
                : `${TODAY_ITEM_PRESENTATION[item.type].label}: ${item.title}`
          }
        >
          {isTaskLike(item) && !done ? (
            <Pressable
              onPress={(press) => {
                press.stopPropagation();
                onMenu();
              }}
              style={styles.taskCheck}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Complete or manage ${item.title}`}
              testID={`home-today-menu-${item.id}`}
            />
          ) : null}
          <View style={styles.itemCopy}>
            <Text
              style={[styles.itemTitle, done ? styles.titlePast : null]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={[
                styles.itemMeta,
                done ? styles.metaPast : null,
                late ? styles.itemMetaLate : null,
              ]}
              numberOfLines={1}
            >
              {late || meta.line}
            </Text>
          </View>
          {done && isTaskLike(item) ? (
            <View style={[styles.statusPill, styles.statusPillDone]}>
              <Text style={[styles.statusPillText, styles.statusPillTextDone]}>
                Completed
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.itemTypeIcon,
                { backgroundColor: TODAY_ITEM_PRESENTATION[item.type].surface },
              ]}
              accessibilityLabel={TODAY_ITEM_PRESENTATION[item.type].label}
            >
              <ItemTypeIcon
                size={12}
                color={TODAY_ITEM_PRESENTATION[item.type].color}
                strokeWidth={2.2}
              />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...cardSurface,
    paddingBottom: 8,
  },
  cardAlenio: {
    backgroundColor: "#F8F6FF",
    shadowOpacity: 0,
    elevation: 0,
  },
  emptyCard: {
    ...cardSurface,
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    overflow: "hidden",
    paddingLeft: 14,
    paddingRight: 118,
    paddingVertical: 10,
  },
  cardWide: {
    flex: 1,
    overflow: "hidden",
    paddingBottom: 0,
  },
  emptyTall: {
    ...cardSurface,
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#FBFAFF",
    overflow: "hidden",
    shadowOpacity: 0,
    elevation: 0,
  },
  emptyTallBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingBottom: 56,
  },
  timelineFill: {
    flex: 1,
    minHeight: 0,
    marginBottom: HILLS_HEIGHT - HILLS_OVERLAP,
  },
  timelineScroll: {
    flex: 1,
  },
  emptyMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDE9FE",
  },
  emptyCaughtTitle: {
    marginTop: 14,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#111A2B",
    textAlign: "center",
  },
  emptyCaughtBody: {
    marginTop: 6,
    maxWidth: 240,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: "#667085",
    textAlign: "center",
  },
  emptyAdd: {
    marginTop: 16,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EDE9FE",
  },
  emptyAddText: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
    color: PURPLE,
  },
  hills: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: HILLS_HEIGHT,
  },
  emptyCalendar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  emptyText: {
    fontSize: 10.5,
    lineHeight: 14,
    color: "#7C8799",
  },
  emptyArtwork: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 132,
    height: 62,
  },
  emptyCheck: {
    position: "absolute",
    right: 32,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C7B8FF",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 0,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F0FF",
  },
  headerCopy: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 88,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#111A2B",
  },
  date: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#98A2B3",
  },
  timeline: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 2,
    overflow: "visible",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    overflow: "visible",
  },
  rowLast: {
    marginBottom: 0,
  },
  timeCol: {
    width: 56,
    paddingTop: 14,
    alignItems: "flex-start",
  },
  timeMain: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#4E596D",
  },
  rail: {
    width: 18,
    alignSelf: "stretch",
    alignItems: "center",
    overflow: "visible",
  },
  railLine: {
    position: "absolute",
    left: 8,
    width: 2,
    top: MARKER_CENTER,
    bottom: -MARKER_CENTER,
    backgroundColor: "#DCD5F7",
  },
  markerSlot: {
    marginTop: MARKER_TOP,
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  lateDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: LATE,
    backgroundColor: "#FFFFFF",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 50,
    marginVertical: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(105, 71, 232, 0.08)",
    backgroundColor: "rgba(255, 255, 255, 0.82)",
  },
  taskCheck: {
    width: 19,
    height: 19,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#D0D5DD",
    backgroundColor: "#FFFFFF",
  },
  timePast: {
    color: "#98A2B3",
  },
  titlePast: {
    color: "#98A2B3",
    fontWeight: "600",
  },
  metaPast: {
    color: "#C5CAD3",
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
    color: "#111A2B",
  },
  itemMeta: {
    marginTop: 3,
    fontSize: 11.5,
    lineHeight: 16,
    color: "#667085",
  },
  itemMetaLate: {
    color: LATE,
    fontWeight: "600",
  },
  timelineCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PURPLE,
  },
  statusPill: {
    minWidth: 38,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEEAFE",
  },
  statusPillDone: {
    backgroundColor: "#F0F1F4",
  },
  statusPillText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: PURPLE,
  },
  statusPillTextDone: {
    color: "#697386",
  },
  itemTypeIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  moreCue: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 2,
    alignItems: "center",
  },
  moreCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16, 24, 40, 0.14)",
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
});
