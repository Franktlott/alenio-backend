import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { Building2, Globe2, Users } from "lucide-react-native";
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
import { ReactionListSheet } from "@/components/workspace/ReactionListSheet";
import { WS } from "@/components/workspace/workspace-ui";
import { colors, space } from "@/theme";

export const PERSONAL_FEED_KEY = ["personal-feed"] as const;

function bodyFromMetadata(metadata: Record<string, unknown> | null): string {
  const body = metadata?.body;
  return typeof body === "string" ? body.trim() : "";
}

function isNetworkItem(item: PersonalFeedItem): boolean {
  return (
    item.type === "network_post" ||
    item.source === "network" ||
    item.source === "public"
  );
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
  if (isAlenioItem(item)) {
    router.push({
      pathname: "/alenio-post-detail",
      params: { activityId: item.id },
    });
    return;
  }
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
  // Alenio posts use the brand mark as the avatar — no source chip.
  if (item.source === "alenio") return null;
  const Icon =
    item.source === "network"
      ? Users
      : item.source === "public"
        ? Globe2
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
  contentInsetLeft,
  contentInsetRight,
  pickerOpen,
  onTogglePicker,
  onPressReactions,
  onReact,
}: {
  item: PersonalFeedItem;
  currentUserId: string;
  contentInsetLeft: number;
  contentInsetRight: number;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onPressReactions: () => void;
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
  const itemPad = {
    paddingLeft: contentInsetLeft,
    paddingRight: contentInsetRight,
  };

  return (
    <Pressable
      onPress={onOpen}
      style={styles.item}
      accessibilityRole="button"
      testID={`personal-feed-card-${item.id}`}
    >
      <View style={styles.itemBody}>
        <View style={[styles.itemPad, itemPad]}>
          <View style={styles.cardTop}>
            {isAlenioItem(item) ? (
              <Image
                source={require("@/assets/alenio-icon.png")}
                style={styles.alenioMark}
                resizeMode="contain"
                accessibilityLabel="Alenio"
              />
            ) : (
              <UserAvatar
                user={{
                  name: author,
                  image: item.user?.image ?? null,
                }}
                size={36}
                radius={18}
                backgroundColor="#F1F5F9"
                textColor="#334155"
                fontSize={13}
                workplaceConnected={false}
              />
            )}
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
        </View>
        {imageUrl ? (
          <View style={styles.media}>
            <PostMediaAttachment
              url={imageUrl}
              mediaType={mediaType}
              flat
              onInteraction={() => {
                suppressOpenUntil.current = Date.now() + 750;
              }}
            />
          </View>
        ) : null}
        <View style={[styles.engagePad, itemPad]}>
          {pickerOpen ? (
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
          ) : null}
          <FeedEngagementRow
            reactions={item.reactions}
            currentUserId={currentUserId}
            onToggleReaction={onReact}
            onOpenPicker={onTogglePicker}
            onPressReactions={onPressReactions}
            onPressComment={onOpen}
            commentCount={item.commentCount}
            flat
            testID={`personal-feed-engage-${item.id}`}
          />
        </View>
      </View>
      <View style={styles.itemRule} />
    </Pressable>
  );
}

export function PersonalFeedList({
  onFindPeople,
  embedded = false,
}: {
  onFindPeople?: () => void;
  /** Column inside a wide Network split — drop page max-width centering. */
  embedded?: boolean;
}) {
  const bottomClearance = useTabBarClearanceFn()(14);
  const { columnWidth } = useAdaptiveLayout();
  const statusCluster = useStatusClusterInset();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const currentUserName = session?.user?.name?.trim() || "You";
  const queryClient = useQueryClient();
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [reactionsItemId, setReactionsItemId] = useState<string | null>(null);
  const columnPad = embedded
    ? {
        alignSelf: "stretch" as const,
        width: "100%" as const,
        paddingLeft: 0,
        paddingRight: 0,
      }
    : {
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
  const reactionsItem = useMemo(
    () => items.find((item) => item.id === reactionsItemId) ?? null,
    [items, reactionsItemId],
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
    <>
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
        <View
          style={[
            styles.listContent,
            embedded
              ? styles.listContentEmbedded
              : {
                  alignSelf: "center",
                  width: "100%",
                  maxWidth: Math.min(columnWidth, CONTENT_MAX_WIDTH),
                  paddingLeft: WS.pageGutter + statusCluster.left,
                  paddingRight: WS.pageGutter + statusCluster.right,
                },
          ]}
        >
          <Pressable
            onPress={() => router.push("/create-post")}
            style={[styles.compose, embedded ? styles.composeCard : null]}
            accessibilityRole="button"
            testID="personal-feed-compose"
          >
            <UserAvatar
              user={{
                name: currentUserName,
                image: session?.user?.image ?? null,
              }}
              size={embedded ? 36 : 28}
              radius={embedded ? 18 : 14}
              backgroundColor="#F1F5F9"
              textColor="#334155"
              fontSize={embedded ? 13 : 11}
              workplaceConnected={false}
            />
            <Text style={styles.composeText}>
              {embedded
                ? "Share an update, idea, or win..."
                : "Share an update…"}
            </Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.stream,
            embedded
              ? styles.streamEmbedded
              : {
                  alignSelf: "center",
                  width: "100%",
                  maxWidth: Math.min(columnWidth, CONTENT_MAX_WIDTH),
                },
          ]}
        >
          {items.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              currentUserId={currentUserId}
              contentInsetLeft={
                embedded ? 16 : WS.pageGutter + statusCluster.left
              }
              contentInsetRight={
                embedded ? 16 : WS.pageGutter + statusCluster.right
              }
              pickerOpen={pickerId === item.id}
              onTogglePicker={() =>
                setPickerId((current) => (current === item.id ? null : item.id))
              }
              onPressReactions={() => {
                setPickerId(null);
                setReactionsItemId(item.id);
              }}
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
      <ReactionListSheet
        visible={!!reactionsItem}
        reactions={reactionsItem?.reactions ?? {}}
        currentUserId={currentUserId}
        onClose={() => setReactionsItemId(null)}
      />
    </>
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
  list: { flex: 1, backgroundColor: "#FFFFFF" },
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
    paddingBottom: 4,
  },
  listContentEmbedded: {
    alignSelf: "stretch",
    width: "100%",
    paddingTop: 0,
    paddingBottom: 10,
  },
  stream: {
    width: "100%",
    backgroundColor: "transparent",
  },
  streamEmbedded: {
    alignSelf: "stretch",
    width: "100%",
  },
  compose: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4E7EC",
    backgroundColor: "#F8F9FB",
  },
  composeCard: {
    borderRadius: 18,
    borderColor: "rgba(15, 23, 42, 0.06)",
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  composeText: {
    flex: 1,
    fontSize: 14,
    color: "#8A96A8",
  },
  item: {
    backgroundColor: "#FFFFFF",
  },
  itemBody: {
    gap: 4,
    paddingTop: 12,
  },
  itemPad: {
    gap: 8,
  },
  engagePad: {
    paddingTop: 0,
    paddingBottom: 6,
    marginBottom: 0,
  },
  itemRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E4E7EC",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  alenioMark: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
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
  },
  badgeText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.1,
    color: colors.textSecondary,
  },
  time: {
    fontSize: 12,
    color: colors.textMuted,
  },
  headline: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: 21,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  media: {
    marginTop: 2,
  },
  reactionPicker: {
    minHeight: 0,
  },
});
