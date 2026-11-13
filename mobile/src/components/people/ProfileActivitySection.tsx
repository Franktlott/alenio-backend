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
import { Activity } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { NetworkUpdateCard } from "@/components/people/NetworkUpdatesFeed";
import type { NetworkUpdate, NetworkUpdatesFeedResponse } from "@/lib/types";

const BRAND = "#4361EE";
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
}: {
  personId: string;
  personName: string;
  isSelf: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [expanded, setExpanded] = useState(false);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const queryKey = ["profile-activity", personId] as const;

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
  const visible = expanded ? posts : posts.slice(0, PREVIEW_COUNT);
  const hasMore = posts.length > PREVIEW_COUNT || !!feed.hasNextPage;
  const firstName = activityFirstName(personName, isSelf);
  const emptyCopy = isSelf
    ? "When you post, it’ll show up here."
    : `When ${firstName} posts, it’ll show up here.`;

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
    <View style={styles.section} testID="profile-activity-section">
      <View style={styles.header}>
        <Activity size={14} color="#111A2B" strokeWidth={2.2} />
        <Text style={styles.heading}>Activity</Text>
      </View>
      {feed.isLoading ? (
        <ActivityIndicator color={BRAND} style={styles.loader} />
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No posts yet</Text>
          <Text style={styles.emptyText}>{emptyCopy}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
    width: "100%",
    alignSelf: "stretch",
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
  emptyTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#344054",
  },
  emptyText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
  },
  footer: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  seeAll: { fontSize: 13, lineHeight: 16, fontWeight: "700", color: BRAND },
});
