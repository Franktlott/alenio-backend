import { useEffect, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Info,
  Trash2,
  Trophy,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useStatusClusterInset } from "@/lib/adaptive-layout";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import type {
  PersonalRecognition,
  PersonalRecognitionsResponse,
} from "@/lib/types";
import { AppPageBackground } from "@/components/AppPageBackground";
import {
  getDateGroup,
  type ActivityFeedItem,
} from "@/components/activity/types";
import { RecognitionUpdateCard } from "@/components/workspace/RecognitionUpdateCard";
import { ReactionListSheet } from "@/components/workspace/ReactionListSheet";
import { GiveRecognitionSheet } from "@/components/activity/GiveRecognitionSheet";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";

const RECOGNITION_PAGE_SIZE = 20;
const RECOGNITION_VISIBLE_LIMIT = 50;

export default function RecognitionHubScreen() {
  const queryClient = useQueryClient();
  const routeParams = useLocalSearchParams<{
    openGive?: string;
    teamId?: string | string[];
  }>();
  const workspaceTeamId = Array.isArray(routeParams.teamId)
    ? routeParams.teamId[0]
    : routeParams.teamId;
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const currentUserId = authReady?.me?.id ?? session?.user?.id;
  const cluster = useStatusClusterInset({ fullScreen: true });
  const [refreshing, setRefreshing] = useState(false);
  const [reactionsFor, setReactionsFor] = useState<PersonalRecognition | null>(
    null,
  );
  const [giveSheetOpen, setGiveSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"received" | "given">("received");
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [deleteClock, setDeleteClock] = useState(() => Date.now());
  const [recognitionToDelete, setRecognitionToDelete] = useState<{
    recognition: PersonalRecognition;
    source: "received" | "given";
  } | null>(null);
  const deleteTarget = recognitionToDelete?.recognition ?? null;
  const recognitionsQuery = useInfiniteQuery({
    queryKey: ["personal-recognitions", "paginated"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<PersonalRecognitionsResponse>(
        `/api/activity/recognitions?offset=${pageParam}&limit=${RECOGNITION_PAGE_SIZE}`,
      ),
    getNextPageParam: (lastPage, allPages) => {
      const nextOffset = allPages.length * RECOGNITION_PAGE_SIZE;
      const available = Math.max(lastPage.total, lastPage.givenTotal);
      return nextOffset < Math.min(available, RECOGNITION_VISIBLE_LIMIT)
        ? nextOffset
        : undefined;
    },
    staleTime: 30_000,
  });
  const recognitionPages = recognitionsQuery.data?.pages ?? [];
  const recognitions = recognitionPages.flatMap((page) => page.items);
  const total = recognitionPages[0]?.total ?? 0;
  const givenRecognitions = recognitionPages.flatMap((page) => page.givenItems);
  const givenTotal = recognitionPages[0]?.givenTotal ?? 0;
  const visibleRecognitions =
    activeTab === "received" ? recognitions : givenRecognitions;
  const visibleTotal = activeTab === "received" ? total : givenTotal;
  const canLoadMore =
    visibleRecognitions.length <
    Math.min(visibleTotal, RECOGNITION_VISIBLE_LIMIT);
  const deleteRecognitionMutation = useMutation({
    mutationFn: (recognitionId: string) =>
      api.delete<void>(`/api/activity/recognitions/${recognitionId}`),
    onSuccess: async () => {
      setRecognitionToDelete(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["personal-recognitions"] }),
        queryClient.invalidateQueries({ queryKey: ["account-activity"] }),
      ]);
      toast({ title: "Recognition deleted", preset: "done" });
    },
    onError: (error) => {
      toast({
        title: "Couldn’t delete recognition",
        message: error instanceof Error ? error.message : "Please try again.",
        preset: "error",
      });
    },
  });

  useEffect(() => {
    if (routeParams.openGive !== "1") return;
    setGiveSheetOpen(true);
    router.setParams({ openGive: undefined });
  }, [routeParams.openGive]);

  useEffect(() => {
    if (activeTab !== "given") return;
    setDeleteClock(Date.now());
    const timer = setInterval(() => setDeleteClock(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [activeTab]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await recognitionsQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const loadMoreIfNeeded = ({
    layoutMeasurement,
    contentOffset,
    contentSize,
  }: {
    layoutMeasurement: { height: number };
    contentOffset: { y: number };
    contentSize: { height: number };
  }) => {
    const distanceFromBottom =
      contentSize.height - (layoutMeasurement.height + contentOffset.y);
    if (
      distanceFromBottom <= 120 &&
      canLoadMore &&
      recognitionsQuery.hasNextPage &&
      !recognitionsQuery.isFetchingNextPage
    ) {
      void recognitionsQuery.fetchNextPage();
    }
  };

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top"]}
      testID="recognition-hub-screen"
    >
      <AppPageBackground />
      <View
        style={[
          styles.header,
          {
            paddingLeft: 16 + cluster.left,
            paddingRight: 16 + cluster.right,
          },
        ]}
      >
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(app)/home")
          }
          style={styles.headerSide}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={21} color="#172033" strokeWidth={2.25} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Recognition</Text>
          <Text style={styles.headerSubtitle}>Your impact, remembered</Text>
        </View>
        <Pressable
          onPress={() => setHowItWorksOpen(true)}
          style={styles.headerSide}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="How recognition works"
        >
          <Info size={18} color="#526079" strokeWidth={2.1} />
        </Pressable>
      </View>

      <View
        style={[
          styles.fixedContent,
          {
            paddingLeft: 16 + cluster.left,
            paddingRight: 16 + cluster.right,
          },
        ]}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Trophy size={19} color="#6947E8" strokeWidth={2.2} />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryValue}>{total}</Text>
            <Text style={styles.summaryLabel}>
              {total === 1 ? "recognition received" : "recognitions received"}
            </Text>
            <Text style={styles.summaryEncouragement}>Keep making an impact ✨</Text>
          </View>
          <Pressable
            onPress={() => setGiveSheetOpen(true)}
            style={({ pressed }) => [
              styles.giveButton,
              pressed ? styles.giveButtonPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Recognize someone"
          >
            <LinearGradient
              colors={["#5B45FF", "#7C4DFF"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.giveButtonSurface}
            >
              <View style={styles.giveButtonIcon}>
                <Trophy size={11} color="#FFFFFF" strokeWidth={2.3} />
              </View>
              <Text style={styles.giveButtonText}>Give recognition</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your recognition</Text>
        </View>

        <View style={styles.tabs}>
          {(["received", "given"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tab,
                activeTab === tab ? styles.tabActive : null,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab ? styles.tabTextActive : null,
                ]}
              >
                {tab === "received" ? "Received" : "Given"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingLeft: 16 + cluster.left,
            paddingRight: 16 + cluster.right,
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => loadMoreIfNeeded(nativeEvent)}
        scrollEventThrottle={32}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor="#6947E8"
          />
        }
      >
        {!recognitionsQuery.isPending && visibleRecognitions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Image
              source={require("@/assets/alenio-recognition-empty-icon.png")}
              style={styles.emptyIllustration}
              resizeMode="contain"
              accessibilityLabel="Recognition trophy"
            />
            <Text style={styles.emptyTitle}>
              {activeTab === "received"
                ? "Your recognition starts here"
                : "Recognize someone’s impact"}
            </Text>
            <Text style={styles.emptyText}>
              {activeTab === "received"
                ? "When teammates recognize your contributions, they’ll appear here."
                : "Recognition you give will be remembered here."}
            </Text>
            <Pressable
              onPress={() => setGiveSheetOpen(true)}
              style={styles.emptyAction}
              accessibilityRole="button"
            >
              <Text style={styles.emptyActionText}>
                {activeTab === "received"
                  ? "Be the first to recognize someone"
                  : "Give recognition"}
              </Text>
              <ArrowRight size={12} color="#6947E8" strokeWidth={2.2} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {visibleRecognitions.map((recognition) => {
              const giver = recognition.giver;
              const recipient = recognition.recipient;
              const giverName = giver?.name || "A teammate";
              const recipientName =
                recipient?.name ||
                (activeTab === "received" ? "You" : "A connection");
              const sentDeleteWindowOpen =
                recognition.canDelete === true &&
                (!recognition.deleteUntil ||
                  deleteClock <= new Date(recognition.deleteUntil).getTime());
              const canDelete =
                activeTab === "received" || sentDeleteWindowOpen;
              const feedItem: ActivityFeedItem = {
                id: recognition.id,
                teamId: recognition.workspace?.id,
                teamName: recognition.workspace?.name ?? null,
                type: "celebration",
                actor: giver
                  ? {
                      id: giver.id,
                      name: giverName,
                      image: giver.image,
                    }
                  : null,
                title: recipientName,
                timestamp: recognition.createdAt,
                dateGroup: getDateGroup(recognition.createdAt),
                metadata: {
                  targetUserId: recipient?.id,
                  targetName: recipientName,
                  targetUserImage: recipient?.image ?? null,
                  celebrationType: recognition.celebrationType,
                  message: recognition.message,
                },
                reactions: recognition.reactions ?? {},
              };
              // Reacting and commenting live in the thread, so every gesture
              // that would open the tray in the feed opens the thread here.
              const threadTeamId = recognition.workspace?.id;
              const openThread = threadTeamId
                ? () =>
                    router.push({
                      pathname: "/update-detail",
                      params: {
                        teamId: threadTeamId,
                        activityId: recognition.id,
                      },
                    })
                : undefined;
              return (
                <RecognitionUpdateCard
                  key={recognition.id}
                  item={feedItem}
                  currentUserId={currentUserId}
                  commentCount={recognition.commentCount ?? 0}
                  onPressReact={openThread ?? (() => {})}
                  onPressComment={openThread}
                  onPressReactions={() => setReactionsFor(recognition)}
                  onPressMore={
                    canDelete
                      ? () =>
                          setRecognitionToDelete({
                            recognition,
                            source: activeTab,
                          })
                      : undefined
                  }
                />
              );
            })}
            {recognitionsQuery.isFetchingNextPage ? (
              <ActivityIndicator
                size="small"
                color="#6947E8"
                style={styles.loadMoreIndicator}
              />
            ) : null}
          </View>
        )}
      </ScrollView>
      <ReactionListSheet
        visible={!!reactionsFor}
        reactions={reactionsFor?.reactions ?? {}}
        currentUserId={currentUserId}
        onClose={() => setReactionsFor(null)}
      />
      <GiveRecognitionSheet
        visible={giveSheetOpen}
        onClose={() => setGiveSheetOpen(false)}
        workspaceTeamId={workspaceTeamId}
      />
      <AlenioBottomSheet
        visible={howItWorksOpen}
        title="Recognition"
        subtitle="Celebrate the contributions that matter"
        onClose={() => setHowItWorksOpen(false)}
        compact
        showCloseButton
      >
        <AlenioSheetCard tint="purple" compact>
          <View style={styles.howSummary}>
            <AlenioSheetIcon color="#6947E8" compact>
              <Trophy size={15} color="#FFFFFF" strokeWidth={2.2} />
            </AlenioSheetIcon>
            <View style={styles.howSummaryCopy}>
              <Text style={styles.howSummaryTitle}>Recognition stays with you</Text>
              <Text style={styles.howSummaryText}>
                Give recognition to an active connection. Received recognition
                appears in your history, and recognition you send appears under Given.
              </Text>
            </View>
          </View>
        </AlenioSheetCard>
      </AlenioBottomSheet>
      <AlenioBottomSheet
        visible={!!recognitionToDelete}
        title={
          recognitionToDelete?.source === "given"
            ? "Delete sent recognition?"
            : "Delete recognition?"
        }
        subtitle={
          recognitionToDelete?.source === "given"
            ? "Available for 5 minutes · Removes it for both people"
            : "This will remove it from your Recognition Hub"
        }
        onClose={() => {
          if (!deleteRecognitionMutation.isPending) {
            setRecognitionToDelete(null);
          }
        }}
        compact
        showCloseButton
        testID="delete-recognition-sheet"
        footer={
          <>
            <Pressable
              onPress={() => {
                if (deleteTarget) {
                  deleteRecognitionMutation.mutate(deleteTarget.id);
                }
              }}
              disabled={deleteRecognitionMutation.isPending}
              style={[
                styles.deleteButton,
                deleteRecognitionMutation.isPending
                  ? styles.deleteButtonDisabled
                  : null,
              ]}
              testID="confirm-delete-recognition"
            >
              {deleteRecognitionMutation.isPending ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <Text style={styles.deleteButtonText}>Delete recognition</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setRecognitionToDelete(null)}
              disabled={deleteRecognitionMutation.isPending}
              style={alenioSheetStyles.cancelButton}
            >
              <Text style={alenioSheetStyles.cancelButtonText}>
                Keep recognition
              </Text>
            </Pressable>
          </>
        }
      >
        <AlenioSheetCard tint="danger" compact>
          <View style={styles.deleteSummary}>
            <AlenioSheetIcon color="#DC2626" compact>
              <Trash2 size={15} color="#FFFFFF" strokeWidth={2.2} />
            </AlenioSheetIcon>
            <View style={styles.deleteSummaryCopy}>
              <Text style={styles.deleteSummaryTitle}>
                {recognitionToDelete?.source === "given"
                  ? `You recognized ${deleteTarget?.recipient?.name || "a connection"}`
                  : `${deleteTarget?.giver?.name || "A teammate"} recognized you`}
              </Text>
              <Text style={styles.deleteSummaryText} numberOfLines={2}>
                {deleteTarget?.message ||
                  "This recognition will no longer appear in your history."}
              </Text>
            </View>
          </View>
        </AlenioSheetCard>
      </AlenioBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8ECF2",
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  headerSide: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    color: "#172033",
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 12,
    color: "#7A8699",
  },
  scroll: {
    flex: 1,
  },
  fixedContent: {
    paddingTop: 14,
  },
  content: {
    flexGrow: 1,
    paddingBottom: 36,
  },
  summaryCard: {
    minHeight: 76,
    position: "relative",
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E8DFFF",
    backgroundColor: "#F8F5FF",
  },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  summaryCopy: {
    flex: 1,
  },
  summaryValue: {
    fontSize: 21,
    lineHeight: 23,
    fontWeight: "800",
    color: "#172033",
  },
  summaryLabel: {
    marginTop: 1,
    fontSize: 9.5,
    lineHeight: 12,
    color: "#6F7788",
  },
  summaryEncouragement: {
    marginTop: 4,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: "600",
    color: "#6947E8",
  },
  giveButton: {
    borderRadius: 12,
    shadowColor: "#5B45FF",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 3,
  },
  giveButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  giveButtonSurface: {
    minHeight: 36,
    paddingLeft: 7,
    paddingRight: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
  },
  giveButtonIcon: {
    width: 23,
    height: 23,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  giveButtonText: {
    fontSize: 9.75,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 9,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#172033",
  },
  sectionCount: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "600",
    color: "#8A94A6",
  },
  tabs: {
    height: 29,
    marginBottom: 10,
    padding: 2,
    flexDirection: "row",
    borderRadius: 15,
    backgroundColor: "#F2F3F7",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#6D4AFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 1,
  },
  tabText: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
    color: "#8A94A6",
  },
  tabTextActive: {
    color: "#6947E8",
  },
  list: {
    // Cards are full-bleed bands, same as the Updates feed.
    marginHorizontal: -12,
  },
  loadMoreIndicator: {
    marginVertical: 12,
  },
  recognitionCard: {
    minHeight: 86,
    paddingVertical: 13,
    paddingLeft: 15,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    overflow: "hidden",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E8ECF2",
    backgroundColor: "#FFFFFF",
  },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    color: "#172033",
  },
  cardMessage: {
    marginTop: 4,
    fontSize: 10.5,
    lineHeight: 15,
    color: "#515C70",
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 8.5,
    lineHeight: 11,
    color: "#929DAE",
  },
  cardTrailing: {
    alignSelf: "stretch",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 5,
  },
  moreButton: {
    width: 25,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#F5F7FA",
  },
  moreButtonPressed: {
    opacity: 0.65,
  },
  typeChip: {
    minHeight: 28,
    maxWidth: 98,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 9,
  },
  typeChipText: {
    flexShrink: 1,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
  },
  deleteButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    color: "#DC2626",
  },
  deleteSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deleteSummaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  deleteSummaryTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#172033",
  },
  deleteSummaryText: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 14,
    color: "#7A8699",
  },
  emptyCard: {
    flex: 1,
    minHeight: 260,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E8ECF2",
    backgroundColor: "#FFFFFF",
  },
  emptyIllustration: {
    width: 116,
    height: 116,
  },
  emptyTitle: {
    marginTop: 11,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    color: "#172033",
  },
  emptyText: {
    maxWidth: 250,
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    color: "#7A8699",
  },
  emptyAction: {
    marginTop: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  emptyActionText: {
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "800",
    color: "#6947E8",
  },
  howSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  howSummaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  howSummaryTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#172033",
  },
  howSummaryText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: "#69768A",
  },
});
