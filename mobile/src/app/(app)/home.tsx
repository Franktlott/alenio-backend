import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { setStatusBarStyle } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  Trophy,
  UserMinus,
  UserPlus,
} from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlenioHeaderBrand } from "@/components/AlenioHeaderBrand";
import { AppHeaderBand } from "@/components/AppHeaderBand";
import { gradients, palette, tints } from "@/theme";
import { PanelHeader, tintInk } from "@/components/ui";
import { cardSurface } from "@/components/home/home-card-styles";
import { CurvedTabLayout } from "@/components/CurvedTabLayout";
import { HomeTodayCard } from "@/components/home/HomeTodayCard";
import { NoWorkspaceHome } from "@/components/home/NoWorkspaceHome";
import { SenecaResumeCard } from "@/components/home/SenecaResumeCard";
import { fetchSenecaConversations } from "@/lib/seneca-api";
import {
  formatSenecaConversationWhen,
  recentSenecaConversations,
} from "@/lib/seneca-conversation-presentation";
import { PANE_GAP, useAdaptiveLayout } from "@/lib/adaptive-layout";
import { UserAvatar } from "@/components/UserAvatar";
import { type ActivityApiEvent } from "@/components/activity/types";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { timeOfDayGreeting } from "@/lib/coaching-priorities";
import { useTabBarClearanceFn } from "@/lib/tab-bar";
import { useSenecaSheetStore } from "@/lib/state/seneca-sheet-store";
import {
  buildDmLastReadMap,
  getDmUnreadCount,
  useUnreadStore,
} from "@/lib/state/unread-store";
import { useHomeScheduleRealtime } from "@/lib/use-home-schedule-realtime";
import { fetchHomeInsights } from "@/lib/home-insight-api";
import {
  homeInsightForDate,
  mapApiHomeInsight,
} from "@/lib/home-insight-rotation";
import {
  calendarDayFromInstant,
  getBrowserTimeZone,
} from "@/lib/timezone";
import { getUSHolidays } from "@/lib/us-federal-holidays";
import type {
  ConnectionPerson,
  ConnectionsResponse,
  Conversation,
  HomeTodayResponse,
  Team,
} from "@/lib/types";

/** Widest the two columns together are allowed to get before they centre. */
const HOME_SPLIT_MAX_WIDTH = 940;

/** How far the first card rises into the purple band. */
const BAND_CARD_OVERLAP = 28;
/** The gap the cards keep below the greeting (todaySlot / hero margin). */
const FIRST_CARD_GAP = 12;

function GradientName({ children, style }: { children: string; style: object[] }) {
  return (
    <MaskedView
      style={{ flexShrink: 1 }}
      maskElement={<Text style={[...style, { backgroundColor: "transparent" }]}>{children}</Text>}
    >
      <LinearGradient
        colors={[...gradients.brandText]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.2 }}
      >
        <Text style={[...style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

/** How far back a waiting update can be. An unread message stays until it is read. */
const RECENT_ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Enough to notice, short enough that Today stays on the screen. */
const WAITING_ROW_LIMIT = 3;
const WAITING_KINDS = new Set<HomeUpdate["kind"]>([
  "message",
  "mention",
  "recognition",
  "workspace_invite",
]);

/** The gap above the two columns, which is not theirs to fill. */
const SPLIT_ROW_GAP = 16;


type HomeUpdate = {
  id: string;
  kind:
    | "message"
    | "joined"
    | "left"
    | "recognition"
    | "connection_sent"
    | "connection_received"
    | "connection_accepted"
    | "workspace_invite"
    | "mention";
  title: string;
  subtitle: string;
  timestamp: string;
  person: { id: string; name: string; image: string | null } | null;
  conversation?: Conversation;
  /** Where the row opens, for updates that are not a DM or a connection. */
  target?:
    | { kind: "person"; userId: string }
    | { kind: "conversation"; conversationId: string }
    | { kind: "chat" };
};

/**
 * The sentence the backend wrote when the event happened, which already names
 * the person. Older rows predate the separate actorName field, so this keeps
 * them from reading "Someone".
 */
function recordedSentence(activity: ActivityApiEvent): string | null {
  const content = activity.metadata?.content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

function HomeUpdateRow({
  update,
  index,
}: {
  update: HomeUpdate;
  index: number;
}) {
  const UpdateIcon =
    update.kind === "joined" || update.kind === "workspace_invite"
      ? UserPlus
      : update.kind === "left"
        ? UserMinus
        : update.kind === "connection_sent" ||
            update.kind === "connection_received" ||
            update.kind === "connection_accepted"
          ? UserPlus
        : update.kind === "recognition"
          ? Trophy
          : MessageCircle;
  const canOpen =
    update.kind === "recognition" ||
    update.kind === "connection_sent" ||
    update.kind === "connection_received" ||
    !!update.target ||
    (update.kind === "message" && !!update.conversation);

  return (
    <>
      {index > 0 ? <View style={styles.listDivider} /> : null}
      <Pressable
        disabled={!canOpen}
        onPress={() => {
          if (update.kind === "recognition") {
            router.push("/recognition-hub");
            return;
          }
          if (
            update.kind === "connection_sent" ||
            update.kind === "connection_received"
          ) {
            router.push("/(app)/team");
            return;
          }
          if (update.target) {
            if (update.target.kind === "person") {
              router.push({
                pathname: "/person",
                params: { userId: update.target.userId },
              });
            } else if (update.target.kind === "conversation") {
              router.push({
                pathname: "/dm-chat",
                params: { conversationId: update.target.conversationId },
              });
            } else {
              router.push("/(app)/chat");
            }
            return;
          }
          if (!update.conversation) return;
          const conversation = update.conversation;
          router.push({
            pathname: "/dm-chat",
            params: {
              conversationId: conversation.id,
              recipientName: conversation.isGroup
                ? conversation.name || "Group chat"
                : conversation.recipient?.name || "Direct Message",
              recipientImage: conversation.isGroup
                ? conversation.image || ""
                : conversation.recipient?.image || "",
              isGroup: String(conversation.isGroup),
            },
          });
        }}
        style={styles.happeningRow}
        accessibilityRole={canOpen ? "button" : "text"}
      >
        {update.person ? (
          <UserAvatar
            user={update.person}
            size={40}
            radius={20}
            backgroundColor={tints.lavender.bg}
            resetKey={update.id}
          />
        ) : (
          <View style={styles.happeningIcon}>
            <UpdateIcon size={16} color={tints.lavender.fg} strokeWidth={2.2} />
          </View>
        )}
        <View style={styles.happeningCopy}>
          <Text style={styles.happeningRowTitle} numberOfLines={1}>
            {update.title}
          </Text>
          <Text style={styles.happeningRowText} numberOfLines={1}>
            {update.subtitle}
          </Text>
        </View>
      </Pressable>
    </>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearanceFn();
  const adaptive = useAdaptiveLayout();
  const [bodyWidth, setBodyWidth] = useState(0);
  /**
   * Two columns need height as well as width: a phone on its side clears the
   * width bar but leaves both columns too narrow and too short to read. The
   * measurement lands a frame later, so the first paint is a single column.
   */
  const splitHome =
    adaptive.isSplit && adaptive.height >= 560 && bodyWidth > 0;
  /**
   * Scenes stay full-bleed under the Duo status column; cards clear that
   * column with the rail width so they don't sit under the icons.
   */
  const edgeInsetLeft =
    adaptive.iconRailEdge === "left" ? adaptive.iconRailWidth : insets.left;
  const edgeInsetRight =
    adaptive.iconRailEdge === "right" ? adaptive.iconRailWidth : insets.right;
  const gutterLeft = Math.max(
    splitHome ? adaptive.contentPadLeft : 16,
    edgeInsetLeft + 16,
  );
  const gutterRight = Math.max(
    splitHome ? adaptive.contentPadRight : 16,
    edgeInsetRight + 16,
  );
  const availableArea = Math.max(
    0,
    bodyWidth - gutterLeft - gutterRight - PANE_GAP,
  );
  /**
   * Past a point wider columns only stretch the rows, so the pair stops
   * growing and sits centred in whatever is left.
   */
  const columnArea = splitHome
    ? Math.min(availableArea, HOME_SPLIT_MAX_WIDTH)
    : availableArea;
  const slack = Math.round((availableArea - columnArea) / 2);
  /**
   * Half each, floored so both columns are exactly equal. A one-pixel
   * difference would let a card wrap to a different height on each side,
   * which is enough to make the balancing below oscillate.
   */
  const columnWidth = Math.floor(columnArea / 2);
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const openSenecaWithPrompt = useSenecaSheetStore(
    (state) => state.openSheetWithPrompt,
  );
  const openSeneca = useSenecaSheetStore((state) => state.openSheet);
  const openSenecaConversation = useSenecaSheetStore(
    (state) => state.openSheetWithConversation,
  );
  const { data: senecaConversations = [] } = useQuery({
    queryKey: ["seneca-conversations"],
    queryFn: () => fetchSenecaConversations(),
    enabled: !!currentUserId,
    staleTime: 15_000,
  });
  /**
   * One card for every Seneca chat from the last week. Older or expired
   * chats stay in Seneca's own history.
   */
  const resumeConversations = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const fresh = senecaConversations.filter((conversation) => {
      const updated = new Date(conversation.updatedAt).getTime();
      const expires = new Date(conversation.expiresAt).getTime();
      return (
        Number.isFinite(updated) &&
        now - updated <= weekMs &&
        (!Number.isFinite(expires) || expires > now)
      );
    });
    return recentSenecaConversations(fresh, 3);
  }, [senecaConversations]);
  const { data: remoteInsights, isPending: insightsPending } = useQuery({
    queryKey: ["home-insights"],
    queryFn: fetchHomeInsights,
    enabled: !!currentUserId,
    staleTime: 5 * 60_000,
  });
  const weeklyInsight = useMemo(() => {
    if (remoteInsights && !Array.isArray(remoteInsights) && remoteInsights.current) {
      return mapApiHomeInsight(remoteInsights.current);
    }
    if (insightsPending) return null;
    const legacy = Array.isArray(remoteInsights)
      ? remoteInsights
      : remoteInsights?.cards ?? remoteInsights?.items ?? [];
    return homeInsightForDate(new Date(), legacy.map(mapApiHomeInsight));
  }, [insightsPending, remoteInsights]);
  const openWeeklyInsight = () => {
    if (!weeklyInsight) return;
    if (weeklyInsight.destination.type === "recognition") {
      router.push("/recognition-hub");
      return;
    }
    if (weeklyInsight.destination.type === "discover") {
      router.push({
        pathname: "/discover/[slug]",
        params: { slug: weeklyInsight.destination.slug },
      });
      return;
    }
    openSenecaWithPrompt(weeklyInsight.destination.prompt);
  };
  const firstName = session?.user?.name?.trim().split(/\s+/)[0] || "there";
  const { data: connections } = useQuery({
    queryKey: ["connections", currentUserId],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
    enabled: !!currentUserId,
    staleTime: 15_000,
  });
  const { data: conversations = [] } = useQuery({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    enabled: !!currentUserId,
    staleTime: 15_000,
  });
  const lastReadIds = useUnreadStore((state) => state.lastReadIds);
  const dmLastReadIds = useMemo(
    () => buildDmLastReadMap(conversations, lastReadIds),
    [conversations, lastReadIds],
  );
  const { data: dmUnreadCounts } = useQuery({
    queryKey: ["dm-unread-counts", dmLastReadIds],
    queryFn: () =>
      api.post<Record<string, number>>("/api/dms/unread-counts", {
        lastReadIds: dmLastReadIds,
      }),
    enabled: !!currentUserId && conversations.length > 0,
    staleTime: 15_000,
  });
  const { data: teams = [], isPending: teamsPending } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!currentUserId,
    staleTime: 120_000,
  });
  const deviceTimeZone = getBrowserTimeZone();
  const todayKey = calendarDayFromInstant(new Date(), deviceTimeZone);
  const { data: todayData, isPending: todayPending } = useQuery({
    queryKey: ["home-today", currentUserId, todayKey, deviceTimeZone],
    queryFn: () =>
      api.get<HomeTodayResponse>(
        `/api/activity/today?timeZone=${encodeURIComponent(deviceTimeZone)}`,
      ),
    enabled: !!currentUserId && teams.length > 0,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
  /** Live task edits in any workspace, so Today stays current on screen. */
  useHomeScheduleRealtime(useMemo(() => teams.map((team) => team.id), [teams]));
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  /** Everything the page shows, so one pull settles the whole dashboard. */
  const refreshHome = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(
        [
          "home-today",
          "account-activity",
          "connections",
          "teams",
          "dms",
          "dm-unread-counts",
          "seneca-conversations",
          "discover",
        ].map((key) => queryClient.refetchQueries({ queryKey: [key] })),
      );
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);
  const todayItems = useMemo(() => {
    const items = todayData?.items ?? [];
    if (!todayData?.date) return items;
    const [year, month, day] = todayData.date.split("-").map(Number);
    const holiday = getUSHolidays(year!).find(
      ({ date }) =>
        date.getFullYear() === year &&
        date.getMonth() === month! - 1 &&
        date.getDate() === day,
    );
    if (!holiday) return items;
    return [
      {
        id: `holiday-${todayData.date}`,
        type: "holiday" as const,
        title: holiday.name,
        startAt: todayData.dateStart,
        endAt: todayData.dateEnd,
        allDay: true,
        workspace: null,
      },
      ...items,
    ];
  }, [todayData]);
  const { data: accountActivity = [] } = useQuery({
    queryKey: ["account-activity", currentUserId],
    queryFn: () => api.get<ActivityApiEvent[]>("/api/activity"),
    enabled: !!currentUserId,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  /**
   * Events recorded before actorName and actorImage existed still carry the
   * other person's id, so their current name and photo come from the network
   * the Home screen has already loaded.
   */
  const connectionsByUserId = useMemo(() => {
    const byId = new Map<string, ConnectionPerson>();
    for (const entry of connections?.accepted ?? []) {
      byId.set(entry.person.id, entry.person);
    }
    return byId;
  }, [connections]);
  const homeUpdates = useMemo(() => {
    const updates: HomeUpdate[] = [];
    const connectionRequestBuckets = new Map<
      string,
      {
        direction: "sent" | "received";
        count: number;
        names: string[];
        timestamp: string;
        person: HomeUpdate["person"];
      }
    >();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const conversation of conversations) {
      const message = conversation.lastMessage;
      if (
        !message ||
        message.sender.id === currentUserId ||
        getDmUnreadCount(dmUnreadCounts ?? {}, conversation.id) <= 0
      ) {
        continue;
      }
      const senderImage =
        conversation.participants?.find(
          (participant) => participant.id === message.sender.id,
        )?.image ??
        (conversation.recipient?.id === message.sender.id
          ? conversation.recipient.image
          : null) ??
        null;
      updates.push({
        id: `message-${conversation.id}-${message.id}`,
        kind: "message",
        title: message.sender.name || "Someone",
        subtitle: "Sent you a message",
        timestamp: message.createdAt,
        person: {
          id: message.sender.id,
          name: message.sender.name || "Someone",
          image: senderImage,
        },
        conversation,
      });
    }

    for (const activity of accountActivity) {
      if (new Date(activity.createdAt).getTime() < sevenDaysAgo) {
        continue;
      }
      if (
        activity.type === "connection_request_sent" ||
        activity.type === "connection_request_received"
      ) {
        const direction =
          activity.type === "connection_request_sent" ? "sent" : "received";
        const hourBucket = Math.floor(
          new Date(activity.createdAt).getTime() / (60 * 60 * 1000),
        );
        const bucketKey = `${direction}-${hourBucket}`;
        const actorUserId = activity.metadata?.actorUserId;
        const known = actorUserId
          ? connectionsByUserId.get(actorUserId)
          : undefined;
        const actorName =
          activity.metadata?.actorName?.trim() ||
          known?.name?.trim() ||
          "Someone";
        const existing = connectionRequestBuckets.get(bucketKey);
        if (existing) {
          existing.count += 1;
          if (!existing.names.includes(actorName)) {
            existing.names.push(actorName);
          }
        } else {
          connectionRequestBuckets.set(bucketKey, {
            direction,
            count: 1,
            names: [actorName],
            timestamp: activity.createdAt,
            person: {
              id: actorUserId || activity.id,
              name: actorName,
              image: activity.metadata?.actorImage ?? known?.image ?? null,
            },
          });
        }
        continue;
      }

      const teamName = activity.team?.name || "a workspace";
      if (
        (activity.type === "member_joined" ||
          activity.type === "member_removed") &&
        activity.user?.id === currentUserId
      ) {
        const joined = activity.type === "member_joined";
        updates.push({
          id: `activity-${activity.id}`,
          kind: joined ? "joined" : "left",
          title: joined ? `You joined ${teamName}` : `You left ${teamName}`,
          subtitle: joined
            ? "Your workspace is ready"
            : "Workspace membership ended",
          timestamp: activity.createdAt,
          person: activity.user,
        });
      } else if (activity.type === "connection_accepted") {
        const actorUserId = activity.metadata?.actorUserId;
        const known = actorUserId
          ? connectionsByUserId.get(actorUserId)
          : undefined;
        const actorName =
          activity.metadata?.actorName?.trim() || known?.name?.trim();
        const actorImage =
          activity.metadata?.actorImage ?? known?.image ?? null;
        updates.push({
          id: `activity-${activity.id}`,
          kind: "connection_accepted",
          title: actorName
            ? `${actorName} connected with you`
            : recordedSentence(activity) || "You have a new connection",
          subtitle: actorUserId
            ? "Tap to view their profile"
            : "Connection accepted",
          timestamp: activity.createdAt,
          person: actorUserId
            ? {
                id: actorUserId,
                name: actorName || "Connection",
                image: actorImage,
              }
            : null,
          target: actorUserId
            ? { kind: "person", userId: actorUserId }
            : undefined,
        });
      } else if (activity.type === "workspace_invitation_received") {
        const inviterId = activity.metadata?.actorUserId;
        const knownInviter = inviterId
          ? connectionsByUserId.get(inviterId)
          : undefined;
        const actorName =
          activity.metadata?.actorName?.trim() || knownInviter?.name?.trim();
        const invitedTo = activity.metadata?.teamName?.trim() || "a workspace";
        // Accepting happens through the emailed link, so this row only informs.
        updates.push({
          id: `activity-${activity.id}`,
          kind: "workspace_invite",
          title: actorName || "Someone",
          subtitle: `Invited you to ${invitedTo}`,
          timestamp: activity.createdAt,
          person: inviterId
            ? {
                id: inviterId,
                name: actorName || "Teammate",
                image:
                  activity.metadata?.actorImage ?? knownInviter?.image ?? null,
              }
            : null,
        });
      } else if (activity.type === "mention_in_conversation") {
        const mentionerId = activity.metadata?.actorUserId;
        const knownMentioner = mentionerId
          ? connectionsByUserId.get(mentionerId)
          : undefined;
        const actorName =
          activity.metadata?.actorName?.trim() || knownMentioner?.name?.trim();
        const conversationId = activity.metadata?.conversationId;
        updates.push({
          id: `activity-${activity.id}`,
          kind: "mention",
          title: actorName || "Someone",
          subtitle: "Mentioned you",
          timestamp: activity.createdAt,
          person: mentionerId
            ? {
                id: mentionerId,
                name: actorName || "Teammate",
                image:
                  activity.metadata?.actorImage ?? knownMentioner?.image ?? null,
              }
            : null,
          target: conversationId
            ? { kind: "conversation", conversationId }
            : { kind: "chat" },
        });
      } else if (
        activity.type === "celebration" &&
        activity.metadata?.targetUserId === currentUserId
      ) {
        updates.push({
          id: `activity-${activity.id}`,
          kind: "recognition",
          title: activity.user?.name || "Someone",
          subtitle: "Recognized you",
          timestamp: activity.createdAt,
          person: activity.user,
        });
      }
    }

    for (const [bucketKey, bucket] of connectionRequestBuckets) {
      const multiple = bucket.count > 1;
      const names =
        bucket.names.length > 1
          ? `${bucket.names[0]} and ${bucket.names.length - 1} other${
              bucket.names.length > 2 ? "s" : ""
            }`
          : bucket.names[0] || "Someone";
      updates.push({
        id: `connection-request-${bucketKey}`,
        kind:
          bucket.direction === "sent"
            ? "connection_sent"
            : "connection_received",
        title:
          bucket.direction === "sent"
            ? multiple
              ? `${bucket.count} connection requests sent`
              : `Connection request sent to ${names}`
            : names,
        subtitle:
          bucket.direction === "sent"
            ? multiple
              ? names
              : "Waiting for a response"
            : multiple
              ? "Sent you connection requests"
              : "Sent you a connection request",
        timestamp: bucket.timestamp,
        person: bucket.person,
      });
    }

    /** A day's worth only: Home reports what is new, not what has happened. */
    const cutoff = Date.now() - RECENT_ACTIVITY_WINDOW_MS;

    return updates
      .filter((update) => WAITING_KINDS.has(update.kind))
      .filter(
        (update) =>
          update.kind === "message" ||
          new Date(update.timestamp).getTime() >= cutoff,
      )
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() -
          new Date(left.timestamp).getTime(),
      )
      .slice(0, WAITING_ROW_LIMIT);
  }, [
    accountActivity,
    connectionsByUserId,
    conversations,
    currentUserId,
    dmUnreadCounts,
  ]);

  const waitingUpdates =
    !teamsPending && teams.length === 0
      ? homeUpdates.filter((update) => update.kind !== "connection_received")
      : homeUpdates;
  const waitingBlock =
    waitingUpdates.length > 0 ? (
      <View style={styles.waitingCard} testID="home-waiting-list">
        <PanelHeader
          eyebrow="Waiting for you"
          title={
            waitingUpdates.length === 1
              ? "1 new update"
              : `${waitingUpdates.length} new updates`
          }
          tint="peach"
          icon={<MessageCircle size={16} color={tintInk("peach")} strokeWidth={2.2} />}
          style={{ marginBottom: 2 }}
        />
        {waitingUpdates.map((update, index) => (
          <HomeUpdateRow key={update.id} update={update} index={index} />
        ))}
      </View>
    ) : null;

  const unreadMessages = conversations.reduce(
    (total, conversation) =>
      total + Math.max(0, getDmUnreadCount(dmUnreadCounts ?? {}, conversation.id)),
    0,
  );
  const openToday = todayItems.filter(
    (item) => item.type !== "holiday" && !("done" in item && item.done),
  ).length;
  const glanceChips = [
    teams.length > 0 && !todayPending
      ? { key: "today", value: openToday, label: "today", dot: "#a78bfa" }
      : null,
    unreadMessages > 0
      ? {
          key: "messages",
          value: unreadMessages,
          label: unreadMessages === 1 ? "new message" : "new messages",
          dot: "#f472b6",
        }
      : null,
    connections
      ? {
          key: "connections",
          value: connections.accepted.length,
          label: connections.accepted.length === 1 ? "connection" : "connections",
          dot: "#22d3ee",
        }
      : null,
  ].filter((chip) => chip !== null);

  /**
   * The band ends a little below the greeting, so the first card rises into
   * it. Measured in window coordinates because the band is fixed behind the
   * scroll view while the greeting lives inside it.
   *
   * Cold start and returning from background can report a stale window frame
   * on the first layout, so we measure again on focus and when the app wakes.
   */
  const greetingRef = useRef<View>(null);
  const scrollY = useRef(0);
  const [bandHeight, setBandHeight] = useState(0);
  const measureBand = useCallback(() => {
    const read = () => {
      greetingRef.current?.measureInWindow((_x, y, _width, height) => {
        if (height <= 0) return;
        const next = Math.round(
          y + scrollY.current + height + FIRST_CARD_GAP + BAND_CARD_OVERLAP,
        );
        setBandHeight((current) =>
          Math.abs(current - next) > 1 ? next : current,
        );
      });
    };
    read();
    // Second pass after the window / safe-area settle on open.
    requestAnimationFrame(read);
  }, []);

  /** The band is dark, so the status bar text is light while Home is in front. */
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      measureBand();
      const wake = AppState.addEventListener("change", (state) => {
        if (state !== "active") return;
        setStatusBarStyle("light");
        measureBand();
      });
      return () => {
        wake.remove();
        setStatusBarStyle("dark");
      };
    }, [measureBand]),
  );

  useEffect(() => {
    measureBand();
  }, [measureBand, insets.top, adaptive.iconRailWidth, adaptive.width]);

  const heroBackdrop = (
    <AppHeaderBand
      height={bandHeight > 0 ? bandHeight : insets.top + 250}
      pageColor="#FFFFFF"
    />
  );

  const dateEyebrow = new Date()
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();
  const greetingStyle = [
    styles.greeting,
    bodyWidth > 0 && bodyWidth < 420 ? styles.greetingCompact : null,
  ].filter(Boolean) as object[];

  const headerBlock = (
    <View
      ref={greetingRef}
      onLayout={measureBand}
      style={styles.greetingBlock}
      testID="home-greeting-card"
    >
      <Text style={styles.greetingEyebrow}>{dateEyebrow}</Text>
      <View style={styles.greetingLine}>
        <Text style={greetingStyle} numberOfLines={1}>
          {timeOfDayGreeting()},{" "}
        </Text>
        <GradientName style={greetingStyle}>{`${firstName}.`}</GradientName>
      </View>
      <Text style={styles.greetingSubtitle} numberOfLines={2}>
        Stay connected, make progress, and grow your impact.
      </Text>
      {glanceChips.length > 0 ? (
        <View style={styles.chips}>
          {glanceChips.map((chip) => (
            <View key={chip.key} style={styles.chip}>
              <View style={[styles.chipDot, { backgroundColor: chip.dot }]} />
              <Text style={styles.chipText}>
                <Text style={styles.chipValue}>{chip.value}</Text> {chip.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <CurvedTabLayout
      topInset={insets.top}
      title="Alenio"
      hideHeaderTitle
      leftAction={<AlenioHeaderBrand tone="dark" />}
      headerTone="brand"
      backdrop={heroBackdrop}
      backdropVisible
      testID="home-screen"
      headerTestID="home-header"
    >
      <ScrollView
        style={[styles.page, styles.pageTransparent]}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: tabClearance(resumeConversations.length > 0 ? 56 : 28),
            paddingLeft: gutterLeft + slack,
            paddingRight: gutterRight + slack,
          },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshHome}
            tintColor="#FFFFFF"
            colors={[palette.violet]}
          />
        }
        onLayout={(event) => {
          setBodyWidth(event.nativeEvent.layout.width);
          measureBand();
        }}
      >
        <View>{headerBlock}</View>

        {teamsPending ? null : (
          <View style={styles.sectionGap} testID="home-stack">
            <NoWorkspaceHome
              connections={connections}
              hasWorkspace={teams.length > 0}
              wide={splitHome}
              columnWidth={columnWidth}
              waitingCard={waitingBlock}
              todayCard={
                teams.length > 0 ? (
                  <HomeTodayCard
                    items={todayItems}
                    pending={todayPending}
                    // Wide Home pairs Today with Insight; fill matches that column.
                    fill={splitHome && !!weeklyInsight?.title}
                    variant="alenio"
                  />
                ) : undefined
              }
              insightTitle={weeklyInsight?.title ?? null}
              insightBody={weeklyInsight?.body ?? ""}
              insightAction={weeklyInsight?.actionLabel ?? ""}
              insightImage={weeklyInsight?.image ?? { uri: "" }}
              onInsight={openWeeklyInsight}
            />
          </View>
        )}

        {resumeConversations.length > 0 ? (
          <View style={{ marginTop: 14 }}>
            <SenecaResumeCard
              conversations={resumeConversations.map((conversation) => ({
                id: conversation.id,
                title:
                  conversation.title?.trim() ||
                  conversation.preview?.trim() ||
                  "Untitled chat",
                whenLabel: formatSenecaConversationWhen(conversation.updatedAt),
              }))}
              onOpen={openSenecaConversation}
              onContinue={openSeneca}
            />
          </View>
        ) : null}
      </ScrollView>
    </CurvedTabLayout>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingTop: 14,
  },
  /** Wide: the day on the left, waiting items and the coaching line on the right. */
  splitRow: {
    marginTop: SPLIT_ROW_GAP,
    flexDirection: "row",
    /** Stretch, so the shorter column still reaches the taller one's floor. */
    alignItems: "stretch",
    gap: PANE_GAP,
  },
  /** Today absorbs leftover height. It is the page's lead content. */
  dayFill: {
    flexGrow: 1,
  },
  /** A bounded slot so the day's own list can scroll. */
  dayScroll: {
    flex: 1,
    minHeight: 0,
  },
  /**
   * Measured widths rather than flex shares: inside a scroll view's content
   * container the shares were not honoured, which left the day a sliver.
   */
  splitColumn: {
    minWidth: 0,
  },
  sectionGap: {
    marginTop: 0,
  },
  greetingBlock: {
    zIndex: 1,
    paddingTop: 6,
    paddingBottom: 4,
  },
  pageTransparent: {
    backgroundColor: "transparent",
  },
  greetingEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: palette.lilac,
  },
  greetingLine: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  greeting: {
    flexShrink: 1,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: "#FFFFFF",
  },
  greetingCompact: {
    fontSize: 25,
    lineHeight: 31,
  },
  greetingSubtitle: {
    marginTop: 4,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "500",
    color: "rgba(255,255,255,0.68)",
  },
  chips: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#EDE9FE",
  },
  chipValue: {
    fontWeight: "800",
    color: "#FFFFFF",
  },
  waitingCard: {
    ...cardSurface,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
  },
  getStartedCard: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 20,
    // Clips the mark where it runs past the card.
    overflow: "hidden",
    shadowColor: "#24324A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 11,
    elevation: 2,
  },
  /** One item, so the card is a row rather than a panel. */
  getStartedCopy: {
    /** The mark sits low, so only this much clearance keeps them apart. */
    paddingRight: 56,
  },
  /**
   * Pinned to both edges rather than given a height: the mark then centres
   * itself down the right side whatever the card's copy does to its height.
   */
  getStartedMark: {
    position: "absolute",
    right: -22,
    top: -12,
    bottom: -12,
    width: 168,
  },
  getStartedEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "#8A93A8",
  },
  getStartedTitle: {
    marginTop: 5,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#111A2B",
  },
  getStartedSubtitle: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 17,
    color: "#6B7689",
  },
  /** All three fit side by side on a wide screen; a phone drops the link. */
  getStartedActions: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 10,
    rowGap: 2,
  },
  getStartedPrimary: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6d28d9",
  },
  getStartedPrimaryText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  getStartedScan: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFE9FF",
  },
  /**
   * A line of its own, always: left to wrap on its own the text shrank and
   * stacked instead, which put it on the right, over the mark.
   */
  /** Full width, so the links drop to their own line under the buttons. */
  getStartedFooterRow: {
    width: "100%",
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    /**
     * The mark's lower wing reaches well past the width the copy above needs
     * to clear, so the links stop a good deal earlier than it does.
     */
    paddingRight: 88,
  },
  /** A frosted chip, since the mark is what sits behind it. */
  getStartedClose: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  joinStrip: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 15,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#24324A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 11,
    elevation: 2,
  },
  joinStripIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFE9FF",
  },
  /** Sized outright: the row is too short to stretch the mark reliably. */
  joinStripMark: {
    position: "absolute",
    right: -16,
    top: -12,
    width: 118,
    height: 84,
  },
  joinStripCopy: {
    flex: 1,
    minWidth: 0,
    /** Clears the mark. */
    paddingRight: 52,
  },
  joinStripTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  joinStripLinks: {
    marginTop: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  joinStripLink: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
    color: "#6d28d9",
  },
  joinStripDot: {
    fontSize: 12.5,
    lineHeight: 17,
    color: "#C3CBD8",
  },
  getStartedLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6d28d9",
  },
  /** Clears the avatar, so the rule sits under the name. */
  listDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
    backgroundColor: palette.rowDivider,
  },
  todayInfoContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  todayInfoCopy: {
    flex: 1,
    minWidth: 0,
  },
  todayInfoTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#172033",
  },
  todayInfoText: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 16,
    color: "#69768A",
  },
  promptGap: {
    marginTop: 22,
  },
  promptBlock: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  promptTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.45,
    color: "#111A2B",
  },
  promptBody: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "400",
    color: "#667085",
  },
  promptLink: {
    alignSelf: "flex-start",
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  promptLinkText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: "#6D5EF8",
  },
  happeningRow: {
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  happeningIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2EEFF",
  },
  happeningCopy: {
    flex: 1,
    minWidth: 0,
  },
  happeningRowTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    color: "#111A2B",
  },
  happeningRowText: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 18,
    color: "#667085",
  },
});
