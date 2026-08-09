import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type ListRenderItemInfo,
} from "react-native";
import { Image } from "expo-image";
import {
  ArrowLeftRight,
  Building2,
  ChevronRight,
  Ellipsis,
  Info,
  Plus,
  UserPlus,
  Users,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import type { Team } from "@/lib/types";
import { formatTeamRole, WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import { api } from "@/lib/api/api";
import type {
  BillingWorkspacesResponse,
  WorkspaceSubscriptionSnapshot,
} from "@/lib/account-hub-api";
import {
  orderWorkspacesCurrentFirst,
  workspaceInitials,
  workspacePreviewCardWidth,
  workspaceStatusDisplay,
} from "@/lib/profile-workspace-carousel";

type TeamWithRole = Team & { role?: string };

type PendingJoinRequest = {
  id: string;
  status: string;
  team: {
    id: string;
    name: string;
    image?: string | null;
  };
};

type WorkspacePreview = TeamWithRole & {
  subscription?: WorkspaceSubscriptionSnapshot | null;
};

type Props = {
  teams: TeamWithRole[];
  activeTeamId: string | null | undefined;
  teamsLoading?: boolean;
  pendingJoinRequests?: PendingJoinRequest[];
  cancelingRequestId?: string | null;
  onCancelPendingRequest?: (requestId: string) => void;
  onOpenWorkspacePage?: (teamId: string) => void;
  onOpenPeople?: (teamId: string) => void;
  onOpenWorkspaceDetails?: (teamId: string) => void;
  onJoinWorkspace?: () => void;
  onCreateWorkspace?: () => void;
};

type WorkspacePreviewCardProps = {
  workspace: WorkspacePreview;
  isCurrent: boolean;
  width: number;
  isSwitching: boolean;
  onPress: (workspace: WorkspacePreview) => void;
  onOpenMenu: (workspace: WorkspacePreview) => void;
};

const CARD_GAP = 10;

const WorkspaceCardSeparator = memo(function WorkspaceCardSeparator() {
  return <View style={{ width: CARD_GAP }} />;
});

const CARD_HEIGHT = 166;
const IMAGE_HEIGHT = 92;
const META_COLOR = "#6B728F";
const CARD_RADIUS = 17;
const CARD_BACKGROUND = "#F8F7FF";
const CURRENT_CARD_BACKGROUND = "#F3F0FF";

const WorkspacePreviewCard = memo(function WorkspacePreviewCard({
  workspace,
  isCurrent,
  width,
  isSwitching,
  onPress,
  onOpenMenu,
}: WorkspacePreviewCardProps) {
  const name = workspace.name?.trim() || "Workspace";
  const role = formatTeamRole(workspace.role) || "Member";
  const status = workspaceStatusDisplay(workspace.subscription);
  const imageUri = workspace.image?.trim() || null;
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUri) && !imageFailed;
  const contentWidth = Math.max(0, width - 20);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  const handlePress = useCallback(() => {
    onPress(workspace);
  }, [onPress, workspace]);

  const handleMenuPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onOpenMenu(workspace);
    },
    [onOpenMenu, workspace],
  );

  return (
    <View
      style={{
        width,
        height: CARD_HEIGHT,
        borderRadius: CARD_RADIUS,
        backgroundColor: isCurrent ? CURRENT_CARD_BACKGROUND : CARD_BACKGROUND,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <Pressable
        onPress={handlePress}
        disabled={isSwitching}
        testID={`workspace-preview-card-${workspace.id}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isCurrent, disabled: isSwitching }}
        accessibilityLabel={`${name}, ${role}, ${status.line}${isCurrent ? ", current workspace" : ""}`}
        style={({ pressed }) => ({
          width,
          height: CARD_HEIGHT,
          borderRadius: CARD_RADIUS,
          borderWidth: isCurrent ? 2 : 1,
          borderColor: isCurrent ? "#6657F5" : "#DDE0EE",
          backgroundColor: isCurrent ? CURRENT_CARD_BACKGROUND : CARD_BACKGROUND,
          overflow: "hidden",
          opacity: pressed || isSwitching ? 0.78 : 1,
        })}
      >
        <View style={{ width: "100%", flexDirection: "column" }}>
          <View
            style={{
              width: "100%",
              height: IMAGE_HEIGHT,
              padding: 5,
            }}
          >
            <View
              style={{
                flex: 1,
                width: "100%",
                borderRadius: 12,
                backgroundColor: "#EDE9FE",
                overflow: "hidden",
              }}
            >
              {showImage ? (
                <Image
                  source={{ uri: imageUri! }}
                  contentFit="cover"
                  recyclingKey={workspace.id}
                  transition={120}
                  onError={() => setImageFailed(true)}
                  style={{ width: "100%", height: "100%" }}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <LinearGradient
                  colors={["#F8F7FF", "#EDE9FE", "#DDD8FF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: "100%",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#6657F5", fontSize: 20, fontWeight: "800" }}>
                    {workspaceInitials(name)}
                  </Text>
                </LinearGradient>
              )}

              {isCurrent ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 8,
                    top: 8,
                    borderRadius: 7,
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    backgroundColor: "#6657F5",
                  }}
                  testID={`workspace-current-badge-${workspace.id}`}
                >
                  <Text style={{ fontSize: 7, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.4 }}>
                    CURRENT
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleMenuPress}
                testID={`workspace-preview-menu-${workspace.id}`}
                accessibilityRole="button"
                accessibilityLabel={`More actions for ${name}`}
                style={({ pressed }) => ({
                  position: "absolute",
                  right: 0,
                  top: 0,
                  width: 40,
                  height: 40,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.96)",
                    borderWidth: 1,
                    borderColor: "#E5E8F0",
                  }}
                >
                  {isSwitching ? (
                    <ActivityIndicator size="small" color="#6657F5" />
                  ) : (
                    <Ellipsis size={14} color="#536079" strokeWidth={2.4} />
                  )}
                </View>
              </Pressable>
            </View>
          </View>

          <View
            style={{
              width: "100%",
              height: CARD_HEIGHT - IMAGE_HEIGHT,
              paddingHorizontal: 10,
              paddingTop: 8,
              paddingBottom: 9,
              justifyContent: "space-between",
              backgroundColor: isCurrent ? CURRENT_CARD_BACKGROUND : CARD_BACKGROUND,
            }}
          >
            <View style={{ width: contentWidth }}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  width: contentWidth,
                  fontSize: 13,
                  lineHeight: 16,
                  fontWeight: "700",
                  color: "#111827",
                  letterSpacing: -0.15,
                }}
              >
                {name}
              </Text>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  width: contentWidth,
                  marginTop: 3,
                  fontSize: 10,
                  lineHeight: 12,
                  fontWeight: "500",
                  color: META_COLOR,
                }}
              >
                {role}
              </Text>
            </View>

            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              testID={`workspace-status-${workspace.id}`}
              style={{
                width: contentWidth,
                fontSize: 9,
                lineHeight: 11,
                fontWeight: "600",
                color: status.kind === "trial" ? "#5B47D6" : META_COLOR,
              }}
            >
              {status.line}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
});

export function ProfileWorkspaceList({
  teams,
  activeTeamId,
  teamsLoading = false,
  pendingJoinRequests = [],
  cancelingRequestId = null,
  onCancelPendingRequest,
  onOpenWorkspacePage,
  onOpenPeople,
  onOpenWorkspaceDetails,
  onJoinWorkspace,
  onCreateWorkspace,
}: Props) {
  const { width: viewportWidth } = useWindowDimensions();
  const { switchWorkspace } = useSwitchWorkspace();
  const carouselRef = useRef<FlatList<WorkspacePreview>>(null);
  const switchingRef = useRef<string | null>(null);
  const [switchingTeamId, setSwitchingTeamId] = useState<string | null>(null);
  const [menuWorkspace, setMenuWorkspace] = useState<WorkspacePreview | null>(null);
  const [carouselOffset, setCarouselOffset] = useState(0);
  const workspaceIdsKey = teams.map((team) => team.id).sort().join(",");

  const { data: billingData } = useQuery({
    // Refetch whenever a workspace is added/removed; otherwise newly-created
    // workspaces incorrectly fall back to "Active" until this cache expires.
    queryKey: ["billing-workspaces", workspaceIdsKey],
    queryFn: () => api.get<BillingWorkspacesResponse>("/api/billing/workspaces"),
    enabled: teams.length > 0,
    staleTime: 60_000,
  });

  const subscriptionByTeamId = useMemo(() => {
    const map = new Map<string, WorkspaceSubscriptionSnapshot | null>();
    for (const workspace of billingData?.workspaces ?? []) {
      map.set(workspace.id, workspace.subscription);
    }
    return map;
  }, [billingData?.workspaces]);

  const workspaces = useMemo(
    () =>
      orderWorkspacesCurrentFirst(
        teams.map((team) => ({
          ...team,
          subscription: subscriptionByTeamId.get(team.id),
        })),
        activeTeamId,
      ),
    [activeTeamId, subscriptionByTeamId, teams],
  );

  const carouselWidth = Math.max(0, viewportWidth - 24);
  const cardWidth = workspacePreviewCardWidth(carouselWidth);
  const carouselContentWidth =
    workspaces.length * cardWidth + Math.max(0, workspaces.length - 1) * CARD_GAP;
  const maxCarouselOffset = Math.max(0, carouselContentWidth - carouselWidth);
  const hasMoreWorkspaces =
    maxCarouselOffset > 2 && carouselOffset < maxCarouselOffset - 2;

  useEffect(() => {
    carouselRef.current?.scrollToOffset({ offset: 0, animated: false });
    setCarouselOffset(0);
  }, [activeTeamId]);

  const advanceCarousel = useCallback(() => {
    const nextOffset = Math.min(
      maxCarouselOffset,
      carouselOffset + cardWidth + CARD_GAP,
    );
    carouselRef.current?.scrollToOffset({ offset: nextOffset, animated: true });
    setCarouselOffset(nextOffset);
  }, [cardWidth, carouselOffset, maxCarouselOffset]);

  const switchToWorkspace = useCallback(
    async (workspace: WorkspacePreview) => {
      if (workspace.id === activeTeamId || switchingRef.current) return;
      switchingRef.current = workspace.id;
      setSwitchingTeamId(workspace.id);
      try {
        await switchWorkspace(workspace.id);
      } finally {
        switchingRef.current = null;
        setSwitchingTeamId(null);
      }
    },
    [activeTeamId, switchWorkspace],
  );

  const handleCardPress = useCallback(
    (workspace: WorkspacePreview) => {
      if (workspace.id === activeTeamId) {
        (onOpenWorkspacePage ?? onOpenWorkspaceDetails)?.(workspace.id);
        return;
      }
      void switchToWorkspace(workspace);
    },
    [activeTeamId, onOpenWorkspaceDetails, onOpenWorkspacePage, switchToWorkspace],
  );

  const handleOpenMenu = useCallback((workspace: WorkspacePreview) => {
    setMenuWorkspace(workspace);
  }, []);

  const closeMenu = useCallback(() => setMenuWorkspace(null), []);

  const runMenuAction = useCallback((action: () => void) => {
    setMenuWorkspace(null);
    setTimeout(action, 250);
  }, []);

  const renderWorkspace = useCallback(
    ({ item }: ListRenderItemInfo<WorkspacePreview>) => (
      <WorkspacePreviewCard
        workspace={item}
        isCurrent={item.id === activeTeamId}
        width={cardWidth}
        isSwitching={item.id === switchingTeamId}
        onPress={handleCardPress}
        onOpenMenu={handleOpenMenu}
      />
    ),
    [activeTeamId, cardWidth, handleCardPress, handleOpenMenu, switchingTeamId],
  );

  const workspaceKey = useCallback((item: WorkspacePreview) => item.id, []);
  const itemLayout = useCallback(
    (_data: ArrayLike<WorkspacePreview> | null | undefined, index: number) => ({
      length: cardWidth + CARD_GAP,
      offset: (cardWidth + CARD_GAP) * index,
      index,
    }),
    [cardWidth],
  );

  if (teamsLoading && teams.length === 0) {
    return (
      <ProfileCard>
        <View style={{ height: CARD_HEIGHT, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#4361EE" testID="workspace-carousel-loading" />
        </View>
      </ProfileCard>
    );
  }

  if (teams.length === 0) {
    return (
      <>
        <ProfileCard
          style={{
            padding: 14,
            borderRadius: 16,
            borderColor: "#E1E2FA",
            backgroundColor: "#FAF9FF",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#E9E7FF",
              }}
            >
              <Building2 size={18} color="#5B47D6" strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#172033" }}>
                You’re not in a workspace yet
              </Text>
              <Text style={{ marginTop: 3, fontSize: 11, lineHeight: 15, color: "#69758C" }}>
                Join an existing workspace or create one for your team.
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <Pressable
              onPress={onJoinWorkspace}
              disabled={!onJoinWorkspace}
              testID="join-workspace-button"
              accessibilityRole="button"
              accessibilityLabel="Join workspace"
              style={({ pressed }) => [
                {
                  flex: 1,
                  height: 40,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#5B47E8",
                },
                { opacity: !onJoinWorkspace ? 0.5 : pressed ? 0.78 : 1 },
              ]}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF" }}>
                Join workspace
              </Text>
            </Pressable>
            <Pressable
              onPress={onCreateWorkspace}
              disabled={!onCreateWorkspace}
              testID="create-workspace-button"
              accessibilityRole="button"
              accessibilityLabel="Create workspace"
              style={({ pressed }) => [
                {
                  flex: 1,
                  height: 40,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: "#8B7CF6",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "#F0EDFF" : "#FFFFFF",
                },
                { opacity: !onCreateWorkspace ? 0.5 : 1 },
              ]}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#5138E5" }}>
                Create workspace
              </Text>
            </Pressable>
          </View>
        </ProfileCard>
      </>
    );
  }

  const selectedIsCurrent = menuWorkspace?.id === activeTeamId;
  const selectedCanManageMembers =
    menuWorkspace?.role === "owner" || menuWorkspace?.role === "team_leader";

  return (
    <>
      <View style={{ height: CARD_HEIGHT }} testID="workspace-preview-carousel">
        <FlatList
          ref={carouselRef}
          horizontal
          data={workspaces}
          renderItem={renderWorkspace}
          keyExtractor={workspaceKey}
          getItemLayout={itemLayout}
          ItemSeparatorComponent={WorkspaceCardSeparator}
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + CARD_GAP}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          bounces={workspaces.length > 1}
          onScroll={(event) => setCarouselOffset(event.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          style={{ height: CARD_HEIGHT, flexGrow: 0 }}
          testID="workspace-carousel-list"
        />
        {hasMoreWorkspaces ? (
          <View
            style={{
              position: "absolute",
              right: 0,
              top: (CARD_HEIGHT - 30) / 2,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: "#E3E7F0",
              shadowColor: "#312E81",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.14,
              shadowRadius: 5,
              elevation: 4,
              zIndex: 10,
            }}
          >
            <Pressable
              onPress={advanceCarousel}
              accessibilityRole="button"
              accessibilityLabel="Show more workspaces"
              testID="workspace-carousel-next"
              hitSlop={6}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ChevronRight size={16} color="#5B47D6" strokeWidth={2.5} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {pendingJoinRequests.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Text
            style={{
              marginBottom: 8,
              marginLeft: 4,
              fontSize: 11,
              fontWeight: "700",
              color: "#94A3B8",
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Pending requests
          </Text>
          <ProfileCard>
            {pendingJoinRequests.map((request, index) => (
              <View key={request.id}>
                {index > 0 ? (
                  <View style={{ height: 1, backgroundColor: "#F1F5F9", marginHorizontal: 14 }} />
                ) : null}
                <View
                  style={{
                    minHeight: 58,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <WorkspaceTeamAvatar
                    team={{ name: request.team.name, image: request.team.image }}
                    size={36}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 14, fontWeight: "700", color: "#172033" }}
                    >
                      {request.team.name}
                    </Text>
                    <Text style={{ marginTop: 2, fontSize: 11, color: "#69758C" }}>
                      Request pending
                    </Text>
                  </View>
                  {onCancelPendingRequest ? (
                    <Pressable
                      onPress={() => onCancelPendingRequest(request.id)}
                      disabled={cancelingRequestId === request.id}
                      hitSlop={8}
                      testID={`cancel-workspace-request-${request.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel request to join ${request.team.name}`}
                    >
                      {cancelingRequestId === request.id ? (
                        <ActivityIndicator size="small" color="#EF4444" />
                      ) : (
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444" }}>
                          Cancel
                        </Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </ProfileCard>
        </View>
      ) : null}

      <AlenioBottomSheet
        visible={menuWorkspace != null}
        title={menuWorkspace?.name ?? "Workspace"}
        subtitle="Workspace actions"
        onClose={closeMenu}
        compact
        scrollEnabled={false}
        testID="workspace-actions-sheet"
        footer={
          <Pressable onPress={closeMenu} style={alenioSheetStyles.cancelButton} testID="workspace-actions-cancel">
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        }
      >
        {!selectedIsCurrent && menuWorkspace ? (
          <AlenioSheetOption
            icon={<ArrowLeftRight size={16} color="#FFFFFF" />}
            title="Switch workspace"
            subtitle={`Make ${menuWorkspace.name} current`}
            onPress={() =>
              runMenuAction(() => {
                void switchToWorkspace(menuWorkspace);
              })
            }
            testID="workspace-action-switch"
          />
        ) : null}
        {menuWorkspace ? (
          <AlenioSheetOption
            icon={<Info size={16} color="#FFFFFF" />}
            title="Workspace details"
            subtitle="View workspace settings and information"
            onPress={() =>
              runMenuAction(() => onOpenWorkspaceDetails?.(menuWorkspace.id))
            }
            testID="workspace-action-details"
          />
        ) : null}
        {menuWorkspace && selectedCanManageMembers && onOpenPeople ? (
          <AlenioSheetOption
            icon={<Users size={16} color="#FFFFFF" />}
            title="Manage members"
            subtitle="Review members, roles, and requests"
            onPress={() => runMenuAction(() => onOpenPeople(menuWorkspace.id))}
            testID="workspace-action-manage-members"
          />
        ) : null}
      </AlenioBottomSheet>

    </>
  );
}
