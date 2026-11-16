import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { Building2, Megaphone, Newspaper, Users } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import {
  CONTENT_MAX_WIDTH,
  useAdaptiveLayout,
  useStatusClusterInset,
} from "@/lib/adaptive-layout";
import { useSession } from "@/lib/auth/use-session";
import { useTabBarClearanceFn } from "@/lib/tab-bar";
import {
  applyReactionToggle,
  formatFeedTimestamp,
} from "@/lib/workspace-updates";
import type { PersonalFeedItem, PersonalFeedResponse } from "@/lib/types";
import { UserAvatar } from "@/components/UserAvatar";
import { PostMediaAttachment } from "@/components/PostMediaAttachment";
import { PersonalFeedShell } from "@/components/people/PersonalFeedShell";
import { ActivityReactionRow } from "@/components/activity/ActivityReactionRow";
import { FeedEngagementRow } from "@/components/workspace/FeedEngagementRow";
import { WS } from "@/components/workspace/workspace-ui";
import { colors, elevation, space } from "@/theme";

export const PERSONAL_FEED_KEY = ["personal-feed"] as const;

function bodyFromMetadata(metadata: Record<string, unknown> | null): string {
  const body = metadata?.body;
  return typeof body === "string" ? body.trim() : "";
}

function isNetworkItem(item: PersonalFeedItem): boolean {
  return item.type === "network_post" || item.source === "network";
}

function isAlenioItem(item: PersonalFeedItem): boolean {
  return item.type === "alenio_post" || item.source === "alenio";
}

/** Event-style one-liners only — posts render body separately so it isn't doubled. */
function headlineFor(item: PersonalFeedItem): string | null {
  if (
    item.type === "network_post" ||
    item.type === "post" ||
    item.type === "alenio_post"
  ) {
    return null;
  }
  if (item.type === "celebration") {
    const target =
      typeof item.metadata?.targetName === "string"
        ? item.metadata.targetName
        : "a teammate";
    return `Recognized ${target}`;
  }
  if (item.type === "task_milestone") {
    const count = item.metadata?.count;
    return typeof count === "number"
      ? `Hit ${count} stars`
      : "Hit a Stars milestone";
  }
  if (item.type === "member_joined") {
    return "Joined the workspace";
  }
  return "Workspace update";
}

function openFeedItem(item: PersonalFeedItem) {
  // Alenio platform posts stay on the Feed card (reactions/comments APIs are live).
  if (isAlenioItem(item)) return;
  if (isNetworkItem(item)) {
    router.push({
      pathname: "/network-update-detail",
      params: { activityId: item.id },
    });
    return;
  }
  if (item.teamId) {
    router.push({
      pathname: "/update-detail",
      params: {
        teamId: item.teamId,
        activityId: item.id,
      },
    });
  }
}

function SourceBadge({ item }: { item: PersonalFeedItem }) {
  const Icon =
    item.source === "alenio"
      ? Megaphone
      : item.source === "network"
        ? Users
        : Building2;
  return (
    <View style={styles.badge} testID={`personal-feed-badge-${item.id}`}>
      <Icon size={11} color={colors.textMuted} strokeWidth={2} />
      <Text style={styles.badgeText} numberOfLines={1}>
        {item.sourceLabel}
      </Text>
    </View>
  );
}

function FeedCard({
  item,
  currentUserId,
  pickerOpen,
  onTogglePicker,
  onReact,
}: {
  item: PersonalFeedItem;
  currentUserId: string;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onReact: (emoji: string) => void;
}) {
  const author = item.user?.name?.trim() || "Someone";
  const body = bodyFromMetadata(item.metadata);
  const headline = headlineFor(item);
  const isPost =
    item.type === "network_post" ||
    item.type === "post" ||
    item.type === "alenio_post";
  const imageUrl =
    typeof item.metadata?.imageUrl === "string" ? item.metadata.imageUrl : null;
  const mediaType =
    item.metadata?.mediaType === "video" ? ("video" as const) : ("image" as const);
  const suppressOpenUntil = useRef(0);
  const onOpen = () => {
    if (Date.now() < suppressOpenUntil.current) return;
    openFeedItem(item);
  };

  return (
    <Pressable
      onPress={onOpen}
      style={styles.card}
      accessibilityRole="button"
      testID={`personal-feed-card-${item.id}`}
    >
      <View style={styles.cardTop}>
        <UserAvatar
          user={{
            name: author,
            image: item.user?.image ?? null,
          }}
          size={36}
          radius={18}
          backgroundColor="#EFE9FF"
          textColor="#6d28d9"
          fontSize={13}
          workplaceConnected={false}
        />
        <View style={styles.cardMeta}>
          <Text style={styles.author} numberOfLines={1}>
            {author}
          </Text>
          <View style={styles.metaRow}>
            <SourceBadge item={item} />
            <Text style={styles.time}>{formatFeedTimestamp(item.createdAt)}</Text>
          </View>
        </View>
      </View>
      {headline ? <Text style={styles.headline}>{headline}</Text> : null}
      {isPost && body ? (
        <Text style={styles.body} numberOfLines={6}>
          {body}
        </Text>
      ) : null}
      {isPost && !body && !imageUrl ? (
        <Text style={styles.body}>Shared an update</Text>
      ) : null}
      {imageUrl ? (
        <View style={styles.media}>
          <PostMediaAttachment
            url={imageUrl}
            mediaType={mediaType}
            onInteraction={() => {
              suppressOpenUntil.current = Date.now() + 750;
            }}
          />
        </View>
      ) : null}
      <View style={styles.reactionPicker}>
        <ActivityReactionRow
          activityId={item.id}
          reactions={item.reactions}
          currentUserId={currentUserId}
          onToggleReaction={onReact}
          showPicker={pickerOpen}
          onClosePicker={onTogglePicker}
          floatPicker
          showPills={false}
        />
      </View>
      <FeedEngagementRow
        reactions={item.reactions}
        currentUserId={currentUserId}
        onToggleReaction={onReact}
        onOpenPicker={onTogglePicker}
        onPressReactions={onTogglePicker}
        onPressComment={onOpen}
        commentCount={item.commentCount}
        testID={`personal-feed-engage-${item.id}`}
      />
    </Pressable>
  );
}

export function PersonalFeedList({
  onFindPeople,
}: {
  onFindPeople?: () => void;
}) {
  const bottomClearance = useTabBarClearanceFn()(14);
  const { columnWidth } = useAdaptiveLayout();
  const statusCluster = useStatusClusterInset();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const currentUserName = session?.user?.name?.trim() || "You";
  const queryClient = useQueryClient();
  const [pickerId, setPickerId] = useState<string | null>(null);
  const columnPad = {
    alignSelf: "center" as const,
    width: "100%" as const,
    maxWidth: Math.min(columnWidth, CONTENT_MAX_WIDTH),
    paddingLeft: WS.pageGutter + statusCluster.left,
    paddingRight: WS.pageGutter + statusCluster.right,
  };
  const [refreshing, setRefreshing] = useState(false);
  const feed = useInfiniteQuery({
    queryKey: PERSONAL_FEED_KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<PersonalFeedResponse>(
        `/api/feed?limit=20${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""
        }`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const items = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );

  const reactionMutation = useMutation({
    mutationFn: ({ item, emoji }: { item: PersonalFeedItem; emoji: string }) => {
      if (isAlenioItem(item)) {
        return api.post(`/api/feed/${item.id}/react`, { emoji });
      }
      if (isNetworkItem(item)) {
        return api.post(`/api/network-updates/${item.id}/react`, { emoji });
      }
      if (!item.teamId) {
        return Promise.reject(new Error("Missing workspace for reaction"));
      }
      return api.post(`/api/teams/${item.teamId}/activity/${item.id}/react`, {
        emoji,
      });
    },
    onMutate: ({ item, emoji }) => {
      if (!currentUserId) return;
      queryClient.setQueryData<InfiniteData<PersonalFeedResponse>>(
        PERSONAL_FEED_KEY,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((row) =>
                row.id === item.id
                  ? {
                      ...row,
                      reactions: applyReactionToggle(row.reactions, emoji, {
                        id: currentUserId,
                        name: currentUserName,
                      }),
                    }
                  : row,
              ),
            })),
          };
        },
      );
      setPickerId(null);
    },
    onError: () => {
      toast({ title: "Couldn’t update reaction", preset: "error" });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PERSONAL_FEED_KEY });
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await feed.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  if (feed.isLoading && !feed.data) {
    return (
      <View style={[styles.loading, columnPad]} testID="personal-feed-loading">
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (feed.isError && items.length === 0) {
    return (
      <View style={[styles.emptyWrap, columnPad]} testID="personal-feed-error">
        <Text style={styles.emptyTitle}>Couldn’t load your feed</Text>
        <Pressable onPress={() => void feed.refetch()} style={styles.retry}>
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.shellWrap, columnPad]}>
        <PersonalFeedShell onFindPeople={onFindPeople} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={[
        styles.listScroll,
        { paddingBottom: bottomClearance },
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      onScroll={({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const nearBottom =
          layoutMeasurement.height + contentOffset.y >= contentSize.height - 180;
        if (nearBottom && feed.hasNextPage && !feed.isFetchingNextPage) {
          void feed.fetchNextPage();
        }
      }}
      scrollEventThrottle={200}
      testID="personal-feed-list"
    >
      <View style={[styles.listContent, columnPad]}>
        <Pressable
          onPress={() => router.push("/create-post")}
          style={styles.compose}
          accessibilityRole="button"
          testID="personal-feed-compose"
        >
          <Newspaper size={16} color={colors.brand} strokeWidth={2.2} />
          <Text style={styles.composeText}>Share an update…</Text>
        </Pressable>

        {items.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            currentUserId={currentUserId}
            pickerOpen={pickerId === item.id}
            onTogglePicker={() =>
              setPickerId((current) => (current === item.id ? null : item.id))
            }
            onReact={(emoji) => reactionMutation.mutate({ item, emoji })}
          />
        ))}

        {feed.isFetchingNextPage ? (
          <ActivityIndicator
            color={colors.brand}
            style={{ marginVertical: 16 }}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  retryLabel: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  list: { flex: 1 },
  listScroll: {
    flexGrow: 1,
    alignItems: "center",
  },
  shellWrap: {
    flex: 1,
    paddingTop: space.sm,
  },
  listContent: {
    paddingTop: space.sm,
    gap: 10,
  },
  compose: {
    ...elevation.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
  },
  composeText: {
    fontSize: 14,
    color: "#8A96A8",
  },
  card: {
    ...elevation.card,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  author: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "70%",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  badgeText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: -0.1,
    color: colors.textSecondary,
  },
  time: {
    fontSize: 11,
    color: colors.textMuted,
  },
  headline: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: 21,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  media: {
    marginTop: 4,
  },
  reactionPicker: {
    minHeight: 0,
  },
});
