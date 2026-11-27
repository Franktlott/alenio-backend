import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { toast } from "burnt";
import { Image as ImageIcon } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { NetworkUpdateCard } from "@/components/people/NetworkUpdatesFeed";
import type { NetworkUpdate, NetworkUpdatesFeedResponse } from "@/lib/types";

import { colors } from "@/theme";

const BRAND = colors.brand;
const PREVIEW_COUNT = 2;

function activityFirstName(name: string, isSelf: boolean): string {
  const first = name.trim().split(/\s+/)[0];
  if (first) return first;
  return isSelf ? "you" : "them";
}

export function ProfileActivitySection({
  personId,
  personName,
  isSelf,
  variant = "section",
}: {
  personId: string;
  personName: string;
  isSelf: boolean;
  /** Panel hides the heading and uses the mock empty state. */
  variant?: "section" | "panel";
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [expanded, setExpanded] = useState(false);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const queryKey = ["profile-activity", personId] as const;
  const isPanel = variant === "panel";

  const feed = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<NetworkUpdatesFeedResponse>(
        `/api/network-updates?authorId=${encodeURIComponent(personId)}&limit=12${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""
        }`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: personId.length > 0,
  });

  const posts = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );
  const visible = isPanel || expanded ? posts : posts.slice(0, PREVIEW_COUNT);
  const hasMore = !isPanel && (posts.length > PREVIEW_COUNT || !!feed.hasNextPage);
  const emptyTitle = isPanel ? "No public activity yet" : "No posts yet";
  const emptyCopy = isPanel
    ? isSelf
      ? "Share a public post to start building your professional presence."
      : "Public posts from this member will appear here."
    : isSelf
      ? "When you post, it’ll show up here."
      : `When ${activityFirstName(personName, isSelf)} posts, it’ll show up here.`;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["network-updates"] });
  };

  const reactionMutation = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) =>
      api.post(`/api/network-updates/${id}/react`, { emoji }),
    onSettled: refresh,
    onError: () => toast({ title: "Couldn’t update reaction", preset: "error" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/network-updates/${id}`),
    onSuccess: () => {
      toast({ title: "Update deleted", preset: "done" });
      refresh();
    },
    onError: () => toast({ title: "Couldn’t delete update", preset: "error" }),
  });

  const openPost = (id: string) =>
    router.push({ pathname: "/network-update-detail", params: { activityId: id } });

  const confirmDelete = (item: NetworkUpdate) => {
    Alert.alert("Delete update?", "This removes the post.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate(item.id),
      },
    ]);
  };

  return (
    <View
      style={[styles.section, isPanel ? styles.sectionPanel : null]}
      testID="profile-activity-section"
    >
      {isPanel ? null : (
        <View style={styles.header}>
          <Text style={styles.heading}>Activity</Text>
        </View>
      )}
      {feed.isLoading ? (
        <ActivityIndicator color={BRAND} style={styles.loader} />
      ) : visible.length === 0 ? (
        <View style={[styles.empty, isPanel ? styles.emptyPanel : null]}>
          {isPanel ? (
            <View style={styles.emptyArt} accessibilityElementsHidden>
              <View style={styles.emptyIconWell}>
                <ImageIcon size={20} color="#8B5CF6" strokeWidth={1.9} />
              </View>
            </View>
          ) : null}
          <Text style={[styles.emptyTitle, isPanel ? styles.emptyTitlePanel : null]}>
            {emptyTitle}
          </Text>
          <Text style={[styles.emptyText, isPanel ? styles.emptyTextPanel : null]}>
            {emptyCopy}
          </Text>
          {isPanel && isSelf ? (
            <Pressable
              onPress={() => router.push("/create-post")}
              style={styles.createPostBtn}
              accessibilityRole="button"
              accessibilityLabel="Create a post"
              testID="profile-activity-create-post"
            >
              <Text style={styles.createPostBtnText}>Create a post</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.list}>
          {visible.map((item) => (
            <NetworkUpdateCard
              key={item.id}
              item={item}
              currentUserId={currentUserId}
              pickerOpen={pickerId === item.id}
              commentsOpen={false}
              onTogglePicker={() =>
                setPickerId((current) => (current === item.id ? null : item.id))
              }
              onReact={(emoji) => reactionMutation.mutate({ id: item.id, emoji })}
              onToggleComments={() => openPost(item.id)}
              onMore={() => {
                if (item.canDelete) confirmDelete(item);
              }}
              onOpen={() => openPost(item.id)}
            />
          ))}
        </View>
      )}
      {visible.length > 0 && hasMore && !expanded ? (
        <Pressable
          onPress={() => {
            setExpanded(true);
            if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
          }}
          style={styles.footer}
          accessibilityRole="button"
          accessibilityLabel="See all activity"
        >
          {feed.isFetchingNextPage ? (
            <ActivityIndicator color={BRAND} />
          ) : (
            <Text style={styles.seeAll}>See all activity</Text>
          )}
        </Pressable>
      ) : null}
      {isPanel && visible.length > 0 && feed.hasNextPage ? (
        <Pressable
          onPress={() => {
            if (!feed.isFetchingNextPage) void feed.fetchNextPage();
          }}
          style={styles.footer}
          accessibilityRole="button"
          accessibilityLabel="Load more activity"
        >
          {feed.isFetchingNextPage ? (
            <ActivityIndicator color={BRAND} />
          ) : (
            <Text style={styles.seeAll}>Load more</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
    width: "100%",
    alignSelf: "stretch",
  },
  sectionPanel: {
    marginTop: 0,
    flexGrow: 1,
  },
  header: {
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heading: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  list: { gap: 8, width: "100%" },
  loader: { marginVertical: 10 },
  empty: {
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4DFF8",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
  },
  emptyPanel: {
    minHeight: 168,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyArt: {
    marginBottom: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconWell: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3EEFF",
    borderWidth: 1,
    borderColor: "#E4DFF8",
  },
  emptyTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#344054",
  },
  emptyTitlePanel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
  },
  emptyTextPanel: {
    marginTop: 6,
    maxWidth: 340,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: "#667085",
  },
  createPostBtn: {
    marginTop: 14,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND,
  },
  createPostBtnText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  footer: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  seeAll: { fontSize: 13, lineHeight: 16, fontWeight: "700", color: BRAND },
});
