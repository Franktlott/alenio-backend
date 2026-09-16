import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import type {
  PersonalRecognition,
  PersonalRecognitionsResponse,
  Team,
} from "@/lib/types";
import {
  applyReactionToggle,
  formatFeedTimestamp,
  isWorkspaceUpdateActivity,
  myReactionEmoji,
  personalRecognitionToActivityEvent,
  recognitionInvolvesWorkspaceMembers,
  totalReactionCount,
  workspaceUpdateBody,
  workspaceUpdateHeadline,
} from "@/lib/workspace-updates";
import { MilestoneUpdateCard } from "@/components/workspace/MilestoneUpdateCard";
import { PostComposerRow } from "@/components/workspace/PostComposerRow";
import { PostUpdateCard } from "@/components/workspace/PostUpdateCard";
import { RecognitionUpdateCard } from "@/components/workspace/RecognitionUpdateCard";
import { WorkspaceUpdateCard } from "@/components/workspace/WorkspaceUpdateCard";
import {
  CelebrationDeleteModal,
  mapApiActivityToFeedItem,
  type ActivityApiEvent,
  type ActivityFeedItem,
} from "@/components/activity";
import type { ActivityReactions } from "@/components/activity/types";
import { ActivityReactionRow } from "@/components/activity/ActivityReactionRow";

type Props = {
  teamId: string | null;
  canManageWorkspace: boolean;
};

function UpdatesFeedItem({
  item,
  teamId,
  currentUser,
  canManageWorkspace,
  showPicker,
  onOpenPicker,
  onClosePicker,
}: {
  item: ActivityFeedItem;
  teamId: string;
  currentUser: { id: string; name: string } | null;
  canManageWorkspace: boolean;
  showPicker: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
}) {
  const queryClient = useQueryClient();
  const currentUserId = currentUser?.id;
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const canDelete =
    (item.type === "celebration" || item.type === "post") &&
    (item.actor?.id === currentUserId || canManageWorkspace);
  const invalidateActivity = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["team-activity", teamId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["personal-recognitions"],
      }),
    ]);
  };

  // Show the reaction on the card right away; the refetch below confirms it.
  const applyLocalReaction = (emoji: string) => {
    if (!currentUser) return;
    const toggle = (reactions: ActivityReactions | null | undefined) =>
      applyReactionToggle(reactions, emoji, currentUser);

    queryClient.setQueryData<ActivityApiEvent[]>(
      ["team-activity", teamId],
      (events) =>
        events?.map((event) =>
          event.id === item.id
            ? { ...event, reactions: toggle(event.reactions) }
            : event,
        ),
    );
    queryClient.setQueriesData<PersonalRecognitionsResponse>(
      { queryKey: ["personal-recognitions"] },
      (data) => {
        if (!data) return data;
        const patch = (recognition: PersonalRecognition) =>
          recognition.id === item.id
            ? { ...recognition, reactions: toggle(recognition.reactions) }
            : recognition;
        return {
          ...data,
          items: data.items.map(patch),
          givenItems: data.givenItems.map(patch),
        };
      },
    );
  };

  const reactionMutation = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/api/teams/${teamId}/activity/${item.id}/react`, { emoji }),
    onMutate: (emoji: string) => {
      applyLocalReaction(emoji);
      onClosePicker();
    },
    onSettled: async () => {
      await invalidateActivity();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/teams/${teamId}/activity/${item.id}`),
    onSuccess: async () => {
      setShowDeleteModal(false);
      await invalidateActivity();
      onClosePicker();
    },
  });

  /** Recognition keeps its own confirm sheet; a post just asks in place. */
  const onPressDelete = !canDelete
    ? undefined
    : () => {
        onClosePicker();
        if (item.type !== "post") {
          setShowDeleteModal(true);
          return;
        }
        Alert.alert("Delete post?", "This removes it for everyone.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteMutation.mutate(),
          },
        ]);
      };

  const openThread = () => {
    onClosePicker();
    router.push({
      pathname: "/update-detail",
      params: { teamId, activityId: item.id },
    });
  };

  const picker = showPicker ? (
    <ActivityReactionRow
      activityId={item.id}
      reactions={item.reactions ?? {}}
      currentUserId={currentUserId}
      onToggleReaction={(emoji) => reactionMutation.mutate(emoji)}
      showPicker
      onClosePicker={onClosePicker}
      floatPicker
      showPills={false}
      tone="default"
    />
  ) : null;

  return (
    <View>
      {item.type === "celebration" ? (
        <RecognitionUpdateCard
          item={item}
          currentUserId={currentUserId}
          onPressReact={onOpenPicker}
          onPressMore={onPressDelete}
          onPressComment={openThread}
          commentCount={item.commentCount ?? 0}
          picker={picker}
        />
      ) : item.type === "task_milestone" ? (
        <MilestoneUpdateCard
          item={item}
          currentUserId={currentUserId}
          onPressReact={onOpenPicker}
          onPressComment={openThread}
          commentCount={item.commentCount ?? 0}
          picker={picker}
        />
      ) : item.type === "post" ? (
        <PostUpdateCard
          item={item}
          currentUserId={currentUserId}
          onPressReact={onOpenPicker}
          onPressMore={onPressDelete}
          onPressComment={openThread}
          commentCount={item.commentCount ?? 0}
          picker={picker}
        />
      ) : (
        <WorkspaceUpdateCard
          author={item.actor ?? { name: "Someone" }}
          timestamp={formatFeedTimestamp(item.timestamp)}
          headline={workspaceUpdateHeadline(item)}
          body={workspaceUpdateBody(item)}
          reactionCount={totalReactionCount(item.reactions)}
          myReaction={myReactionEmoji(item.reactions, currentUserId)}
          onPressLike={onOpenPicker}
          onMore={onOpenPicker}
          onLongPress={onOpenPicker}
          onPressComment={openThread}
          commentCount={item.commentCount ?? 0}
          avatarResetKey={item.id}
          picker={picker}
          testID={`workspace-update-card-${item.id}`}
        />
      )}
      <CelebrationDeleteModal
        visible={showDeleteModal}
        celebrationType={item.metadata.celebrationType}
        targetName={item.metadata.targetName}
        isDeleting={deleteMutation.isPending}
        onCancel={() => {
          if (!deleteMutation.isPending) setShowDeleteModal(false);
        }}
        onConfirm={() => deleteMutation.mutate()}
      />
    </View>
  );
}

export function WorkspaceUpdatesFeed({ teamId, canManageWorkspace }: Props) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const currentUserId = authReady?.me?.id ?? session?.user?.id;
  const currentUserName = authReady?.me?.name ?? session?.user?.name ?? "You";
  const signedInUser = useMemo(
    () => (currentUserId ? { id: currentUserId, name: currentUserName } : null),
    [currentUserId, currentUserName],
  );
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const activityQuery = useQuery({
    queryKey: ["team-activity", teamId ?? ""],
    queryFn: () => api.get<ActivityApiEvent[]>(`/api/teams/${teamId}/activity`),
    enabled: !!teamId,
    refetchInterval: 15_000,
    refetchOnMount: "always",
  });
  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });
  const recognitionsQuery = useQuery({
    queryKey: ["personal-recognitions", "workspace-updates"],
    queryFn: () =>
      api.get<PersonalRecognitionsResponse>(
        "/api/activity/recognitions?offset=0&limit=20",
      ),
    enabled: !!teamId,
    refetchInterval: 15_000,
    refetchOnMount: "always",
  });

  const items = useMemo(() => {
    const currentUser = authReady?.me;
    const memberIds = new Set(
      (teamQuery.data?.members ?? []).map((member) => member.userId),
    );
    const fromTeam = (activityQuery.data ?? []).filter((event) =>
      isWorkspaceUpdateActivity(event.type),
    );
    const fromPersonal = [
      ...(recognitionsQuery.data?.givenItems ?? []),
      ...(recognitionsQuery.data?.items ?? []),
    ]
      .map(personalRecognitionToActivityEvent)
      .filter((event): event is ActivityApiEvent => event != null)
      .filter((event) =>
        recognitionInvolvesWorkspaceMembers(
          event.user?.id,
          event.metadata?.targetUserId,
          memberIds,
        ),
      );

    const byId = new Map<string, ActivityApiEvent>();
    for (const event of fromPersonal) byId.set(event.id, event);
    for (const event of fromTeam) byId.set(event.id, event);

    return [...byId.values()]
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      )
      .map(mapApiActivityToFeedItem)
      .map((item): ActivityFeedItem => {
        const actor = item.actor;
        if (!actor || !currentUser || actor.id !== currentUser.id) return item;
        return {
          ...item,
          actor: {
            ...actor,
            name: currentUser.name || actor.name,
            image: currentUser.image ?? actor.image,
          },
        };
      });
  }, [
    activityQuery.data,
    authReady?.me,
    recognitionsQuery.data,
    teamQuery.data?.members,
  ]);

  const onRefresh = useCallback(() => {
    if (!teamId) return;
    setRefreshing(true);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["team-activity", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["personal-recognitions"] }),
    ]).finally(() => setRefreshing(false));
  }, [queryClient, teamId]);

  if (!teamId) {
    return (
      <View
        style={[styles.page, styles.pageInset]}
        testID="workspace-updates-feed"
      >
        <Text style={styles.empty}>No updates yet</Text>
      </View>
    );
  }

  if (
    activityQuery.isLoading ||
    recognitionsQuery.isLoading ||
    teamQuery.isLoading
  ) {
    return (
      <View
        style={[styles.page, styles.pageInset]}
        testID="workspace-updates-feed"
      >
        <View style={styles.centered} testID="workspace-updates-loading">
          <ActivityIndicator color="#4361EE" />
        </View>
      </View>
    );
  }

  if (activityQuery.isError) {
    return (
      <View
        style={[styles.page, styles.pageInset]}
        testID="workspace-updates-feed"
      >
        <View style={styles.centered} testID="workspace-updates-error">
          <Text style={styles.errorTitle}>Couldn&apos;t load updates</Text>
          <Pressable
            onPress={() => void activityQuery.refetch()}
            style={styles.retry}
            testID="workspace-updates-retry"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page} testID="workspace-updates-feed">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UpdatesFeedItem
            item={item}
            teamId={teamId}
            currentUser={signedInUser}
            canManageWorkspace={canManageWorkspace}
            showPicker={openPickerId === item.id}
            onOpenPicker={() =>
              setOpenPickerId((open) => (open === item.id ? null : item.id))
            }
            onClosePicker={() => setOpenPickerId(null)}
          />
        )}
        ListHeaderComponent={
          <>
            <View style={styles.topBreak} />
            <PostComposerRow
              author={{
                name: currentUserName,
                image: authReady?.me?.image ?? session?.user?.image ?? null,
              }}
              onPress={() =>
                router.push({ pathname: "/create-post", params: { teamId } })
              }
            />
          </>
        }
        ListEmptyComponent={
          <Text style={styles.empty} testID="workspace-updates-empty">
            No updates yet
          </Text>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4361EE"
            colors={["#4361EE"]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        testID="workspace-updates-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // A tinted feed canvas is what separates one post from the next; white cards
  // on a white page read as a single list.
  page: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#FFFFFF",
  },
  pageInset: {
    paddingHorizontal: 16,
  },
  /** Same gray break the cards carry, so the feed starts with one too. */
  topBreak: {
    height: 6,
    backgroundColor: "#F0F3F8",
  },
  listContent: {
    paddingTop: 0,
    // Clears the fixed bottom navigation so the last card stays reachable.
    paddingBottom: 28,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  empty: {
    paddingTop: 28,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#27324A",
    textAlign: "center",
  },
  retry: {
    marginTop: 14,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#4361EE",
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
