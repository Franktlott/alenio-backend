import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Ban,
  Building2,
  ChevronRight,
  Check,
  Clock,
  FileText,
  Layers,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Share2,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  Target,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { connectionRequestOutcome } from "@/lib/connection-request-outcome";
import { connectionRequestErrorMessage } from "@/lib/connection-request-error";
import { resolveUserImageUrl } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { SharedWorkspacesSection } from "@/components/profile/SharedWorkspacesSection";
import { MutualConnectionsSheet } from "@/components/profile/MutualConnectionsSheet";
import { ProfileActivitySection } from "@/components/people/ProfileActivitySection";
import { formatTeamRole } from "@/components/WorkspaceTeamUI";
import type {
  ConnectionRequestResponse,
  ConnectionStatus,
  Conversation,
  PublicPersonProfile,
  PublicProfileWorkspace,
  Team,
} from "@/lib/types";
import { existingDirectConversation } from "@/lib/existing-direct-conversation";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import {
  eligibleProfileWorkspaces,
  manageableProfileWorkspaces,
  resolveProfileWorkspaceId,
} from "@/lib/profile-workspace-context";
import {
  profileDefaultHeaderSource,
  profileHeaderSource,
} from "@/lib/profile-header";
import { headerBannerHeight } from "@/lib/profile-header-frame";
import { ME_QUERY_KEY, type MeUser } from "@/lib/auth/me-query";
import { CONTENT_MAX_WIDTH, useAdaptiveLayout } from "@/lib/adaptive-layout";
import { useTeamStore } from "@/lib/state/team-store";
import {
  workspaceDevelopmentHref,
  type WorkspaceDevelopmentSection,
} from "@/lib/workspace-development-navigation";

const BRAND = "#4361EE";
const PAGE_BG = "#FFFFFF";
/**
 * Wide enough for a portrait, a name and a labelled button, narrow enough that
 * the About rows beside it still read as rows rather than as stranded text.
 */
const IDENTITY_COLUMN_MAX = 360;
const IDENTITY_COLUMN_MIN = 288;
/**
 * Share of the row the identity column takes before those bounds apply, so a
 * portrait tablet hands the wider share to the column that needs it: the stat
 * tiles opposite have to stay side by side.
 */
const IDENTITY_COLUMN_SHARE = 0.4;
/**
 * Narrowest the sections column can be and still hold three stat tiles in one
 * row. Below this the page is better off stacked.
 */
const DETAIL_COLUMN_MIN = 316;
const PROFILE_COLUMN_GAP = 16;

export default function PersonScreen() {
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  /**
   * Identity and About on the left, the sections that gain something from width
   * on the right. The test is whether both columns fit their own minimum rather
   * than a device-shaped width threshold, which a portrait foldable misses by a
   * few points while having ample room for the layout. Height plays no part:
   * unlike the calendar, neither column needs a particular height to be useful.
   */
  const profileRowWidth =
    adaptive.width -
    adaptive.contentPadLeft -
    adaptive.contentPadRight -
    PROFILE_COLUMN_GAP;
  const twoColumn = profileRowWidth >= IDENTITY_COLUMN_MIN + DETAIL_COLUMN_MIN;
  const identityColumnWidth = Math.round(
    Math.min(
      IDENTITY_COLUMN_MAX,
      Math.max(
        IDENTITY_COLUMN_MIN,
        Math.min(
          profileRowWidth * IDENTITY_COLUMN_SHARE,
          profileRowWidth - DETAIL_COLUMN_MIN,
        ),
      ),
    ),
  );
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    userId?: string;
    teamId?: string;
    tab?: string;
    startCheckIn?: string;
    plannedEventId?: string;
    checkInId?: string;
    createGoal?: string;
    intent?: string;
    checkInLaunchId?: string;
  }>();
  const userId = typeof params.userId === "string" ? params.userId : "";
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceSheetSignal, setWorkspaceSheetSignal] = useState(0);
  const [mutualOpen, setMutualOpen] = useState(false);
  const [membershipManagerOpen, setMembershipManagerOpen] = useState(false);
  const [managedWorkspace, setManagedWorkspace] =
    useState<PublicProfileWorkspace | null>(null);
  const [membershipRemoveConfirmOpen, setMembershipRemoveConfirmOpen] =
    useState(false);
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<
    "member" | "team_leader" | null
  >(null);
  const [connectionDestructiveConfirm, setConnectionDestructiveConfirm] =
    useState<{
      action: "remove" | "block";
      title: string;
      message: string;
    } | null>(null);
  const [connectionConfirmation, setConnectionConfirmation] = useState<
    "request" | "cancel" | null
  >(null);
  const personKey = ["person", userId] as const;

  const {
    data: person,
    isLoading,
    isError: personError,
    refetch: refetchPerson,
  } = useQuery({
    queryKey: personKey,
    queryFn: () =>
      api.get<PublicPersonProfile>(
        `/api/connections/person/${encodeURIComponent(userId)}`,
      ),
    enabled: userId.length > 0,
    refetchOnMount: "always",
  });
  const cachedMe = queryClient.getQueryData<MeUser>(ME_QUERY_KEY);
  const pendingHeader = person
    ? person.profileHeaderImage
    : cachedMe?.id === userId && "profileHeaderImage" in cachedMe
      ? cachedMe.profileHeaderImage ?? null
      : undefined;
  const headerImage =
    pendingHeader == null ? pendingHeader : pendingHeader.trim() || null;
  const showCustomHeader = typeof headerImage === "string";
  // Default mountain whenever there isn’t a custom photo (including while loading).
  const showMountainHeader = !showCustomHeader;
  /**
   * Same band math for custom and default. Defaults pick a phone or wide
   * mountain asset so the banner fills without letterboxing.
   */
  const bannerOpts = {
    windowHeight: adaptive.height,
    topInset: insets.top,
  };
  const useWideDefaultHeader =
    twoColumn || adaptive.width / Math.max(adaptive.height, 1) >= 1.2;
  const coverHeight = headerBannerHeight(adaptive.width, bannerOpts);
  const { data: viewerTeams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
  });
  const isSelf = person?.isSelf ?? false;
  const profileWorkspaces = useMemo(
    () =>
      eligibleProfileWorkspaces({
        sharedWorkspaces: person?.sharedWorkspaces ?? [],
        viewerTeams,
        isSelf,
      }),
    [isSelf, person?.sharedWorkspaces, viewerTeams],
  );
  /** Only used to aim a legacy development link that did not name a workspace. */
  const fallbackDevelopmentTeamId = useMemo(
    () =>
      resolveProfileWorkspaceId({
        eligibleWorkspaces: profileWorkspaces,
        preferredTeamId:
          typeof params.teamId === "string" ? params.teamId : null,
        activeTeamId,
      }),
    [activeTeamId, params.teamId, profileWorkspaces],
  );
  const developmentWorkspace =
    profileWorkspaces.find(
      (workspace) => workspace.id === fallbackDevelopmentTeamId,
    ) ?? null;
  const requestedDevelopmentSection =
    useMemo((): WorkspaceDevelopmentSection | null => {
      const tab = params.tab?.trim().toLowerCase();
      if (
        tab === "check-ins" ||
        tab === "check-in" ||
        params.startCheckIn === "true" ||
        params.startCheckIn === "1" ||
        !!params.checkInId
      ) {
        return "check-ins";
      }
      if (
        tab === "goals" ||
        tab === "growth" ||
        tab === "development" ||
        params.createGoal === "true" ||
        params.createGoal === "1" ||
        params.intent === "create-goal"
      ) {
        return "goals";
      }
      return null;
    }, [
      params.checkInId,
      params.createGoal,
      params.intent,
      params.startCheckIn,
      params.tab,
    ]);
  const appliedCheckInLaunchRef = useRef<string | null>(null);

  /**
   * Development now lives in the workspace tab, but notifications and older
   * links still point here. Forward them rather than leaving a dead end.
   */
  useEffect(() => {
    if (!requestedDevelopmentSection || !fallbackDevelopmentTeamId || !userId) {
      return;
    }
    const launchKey = [
      userId,
      fallbackDevelopmentTeamId,
      requestedDevelopmentSection,
      params.checkInId,
      params.plannedEventId,
      params.startCheckIn,
      params.createGoal,
      params.checkInLaunchId,
    ].join(":");
    if (appliedCheckInLaunchRef.current === launchKey) return;
    appliedCheckInLaunchRef.current = launchKey;
    router.replace(
      workspaceDevelopmentHref(fallbackDevelopmentTeamId, {
        memberUserId: userId,
        section: requestedDevelopmentSection,
        createGoal:
          params.createGoal === "true" ||
          params.createGoal === "1" ||
          params.intent === "create-goal",
        startCheckIn:
          params.startCheckIn === "true" || params.startCheckIn === "1",
        checkInId: params.checkInId ?? null,
        plannedEventId: params.plannedEventId ?? null,
        checkInLaunchId: params.checkInLaunchId ?? null,
      }),
    );
  }, [
    fallbackDevelopmentTeamId,
    params.checkInId,
    params.checkInLaunchId,
    params.createGoal,
    params.intent,
    params.plannedEventId,
    params.startCheckIn,
    requestedDevelopmentSection,
    userId,
  ]);

  const refreshPerson = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: personKey }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
      queryClient.invalidateQueries({ queryKey: ["dms"] }),
      queryClient.invalidateQueries({ queryKey: ["profile"] }),
      queryClient.invalidateQueries({ queryKey: ["connection-suggestions"] }),
      queryClient.invalidateQueries({ queryKey: ["user-search"] }),
      queryClient.invalidateQueries({ queryKey: ["network-updates"] }),
    ]);
  };

  const connectionAction = useMutation({
    mutationFn: (
      action: "request" | "accept" | "decline" | "remove" | "block",
    ) => {
      if (action === "remove")
        return api.delete("/api/connections", { userId });
      if (action === "block")
        return api.post("/api/connections/block", { userId });
      return api.post<ConnectionRequestResponse>(`/api/connections/${action}`, {
        userId,
      });
    },
    onSuccess: (response, action) => {
      setConnectionDestructiveConfirm(null);
      if (action === "request") {
        const outcome = connectionRequestOutcome(
          response as ConnectionRequestResponse,
        );
        queryClient.setQueryData<PublicPersonProfile>(personKey, (current) =>
          current ? { ...current, connectionStatus: outcome.status } : current,
        );
        toast({ title: outcome.toastTitle, preset: "done" });
      }
      void refreshPerson();
    },
    onError: (err: unknown) => {
      toast({
        title: connectionRequestErrorMessage(err),
        preset: "error",
      });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: () => api.delete("/api/connections/block", { userId }),
    onSuccess: refreshPerson,
    onError: () => toast({ title: "Could not unblock", preset: "error" }),
  });

  const [openingMessage, setOpeningMessage] = useState(false);
  const openMessage = async () => {
    if (!userId || openingMessage) return;
    setOpeningMessage(true);
    try {
      const list = await queryClient.fetchQuery({
        queryKey: ["dms"],
        queryFn: () => api.get<Conversation[]>("/api/dms"),
      });
      const currentUserId = queryClient.getQueryData<MeUser>(ME_QUERY_KEY)?.id;
      const existing =
        currentUserId
          ? existingDirectConversation(list, userId, currentUserId)
          : null;
      if (existing) {
        router.push({
          pathname: "/dm-chat",
          params: {
            conversationId: existing.id,
            recipientName: person?.name ?? "Direct Message",
            recipientImage: resolveUserImageUrl(person?.image) ?? "",
            isGroup: "false",
          },
        });
        return;
      }
      router.push({
        pathname: "/dm-chat",
        params: {
          recipientId: userId,
          recipientName: person?.name ?? "Direct Message",
          recipientImage: resolveUserImageUrl(person?.image) ?? "",
          isGroup: "false",
        },
      });
    } catch (err: unknown) {
      toast({
        title:
          err instanceof Error ? err.message : "Couldn't open message",
        preset: "error",
      });
    } finally {
      setOpeningMessage(false);
    }
  };
  const workplaceMembershipMutation = useMutation({
    mutationFn: ({
      teamId,
      action,
      role,
    }: {
      teamId: string;
      action: "role" | "remove";
      role?: "member" | "team_leader" | "admin";
    }) =>
      action === "remove"
        ? api.delete(
            `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
          )
        : api.patch(
            `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/role`,
            { role },
          ),
    onSuccess: (_, variables) => {
      setMenuOpen(false);
      setMembershipManagerOpen(false);
      setMembershipRemoveConfirmOpen(false);
      setRoleChangeConfirm(null);
      void queryClient.invalidateQueries({
        queryKey: ["team", variables.teamId],
      });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      void queryClient.invalidateQueries({ queryKey: personKey });
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({
        queryKey: ["connection-suggestions"],
      });
      void queryClient.invalidateQueries({ queryKey: ["user-search"] });
      void queryClient.invalidateQueries({ queryKey: ["dms"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ title: "Workplace membership updated", preset: "done" });
    },
    onError: (err: unknown) =>
      toast({
        title:
          err instanceof Error ? err.message : "Could not update membership",
        preset: "error",
      }),
  });

  const confirmDestructive = (
    action: "remove" | "block",
    title: string,
    message: string,
  ) => {
    setMenuOpen(false);
    setTimeout(
      () => setConnectionDestructiveConfirm({ action, title, message }),
      180,
    );
  };

  const busy = connectionAction.isPending || openingMessage;
  /** Every shared workspace this viewer can manage them in, not just the active one. */
  const manageableWorkspaces = useMemo(
    () =>
      manageableProfileWorkspaces({
        sharedWorkspaces: person?.sharedWorkspaces ?? [],
        viewerTeams,
        isSelf,
      }),
    [isSelf, person?.sharedWorkspaces, viewerTeams],
  );
  const managedRole = viewerTeams.find(
    (team) => team.id === managedWorkspace?.id,
  )?.role;
  const manageWorkspaceMembership = (workspace: PublicProfileWorkspace) => {
    setMenuOpen(false);
    setManagedWorkspace(workspace);
    setTimeout(() => setMembershipManagerOpen(true), 180);
  };

  return (
    <View style={styles.screen} testID="person-screen">
      <View style={[styles.cover, { height: coverHeight }]}>
        {showCustomHeader ? (
          <Image
            source={profileHeaderSource(headerImage)}
            style={[styles.coverFill, { height: coverHeight }]}
            resizeMode="cover"
          />
        ) : showMountainHeader ? (
          <Image
            source={profileDefaultHeaderSource({ wide: useWideDefaultHeader })}
            style={[styles.coverFill, { height: coverHeight }]}
            resizeMode="cover"
          />
        ) : null}
      </View>
      {/**
       * Chrome sits above the sheet so Back stays tappable, but outside the
       * cover stacking context so the avatar can overlap the banner.
       */}
      <View
        pointerEvents="box-none"
        style={[
          styles.coverChrome,
          { height: coverHeight, paddingTop: insets.top + 4 },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="person-back-button"
          >
            <ArrowLeft size={20} color="#111A2B" strokeWidth={2.25} />
          </Pressable>
          <View style={styles.headerRight}>
            {isSelf ? (
              <Pressable
                onPress={() => router.push("/edit-profile")}
                hitSlop={8}
                style={styles.headerButton}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                testID="person-edit-profile"
              >
                <Pencil size={18} color="#111A2B" strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {isLoading ? (
        <ProfileLoadingSkeleton bottomInset={insets.bottom} />
      ) : !person ? (
        <View style={styles.centered}>
          <Text style={styles.unavailableText}>
            {personError
              ? "Couldn’t load this profile"
              : "This person is not available"}
          </Text>
          {personError ? (
            <Pressable
              onPress={() => void refetchPerson()}
              style={styles.retryButton}
              accessibilityRole="button"
              testID="person-retry-button"
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        (() => {
          const actionProps = {
            isSelf: person.isSelf,
            canMessage: person.canMessage,
            blocked: person.isBlockedByMe || person.isBlockedByThem,
            connectionStatus: person.connectionStatus,
            busy,
            onMessage: () => {
              void openMessage();
            },
            onEdit: () => router.push("/edit-profile"),
            onMore: () => setMenuOpen(true),
            onCancelRequest: () => setConnectionConfirmation("cancel"),
            onRequestConnection: () => setConnectionConfirmation("request"),
          };
          const blockedNote =
            !person.isSelf &&
            (person.isBlockedByMe || person.isBlockedByThem) ? (
              <Text
                style={styles.blockedExplanation}
                testID="person-blocked-explanation"
              >
                {person.isBlockedByMe
                  ? "You blocked this person. Unblock them to connect or message."
                  : "Connection and messaging are unavailable for this profile."}
              </Text>
            ) : null;
          const relationshipSection =
            !person.isSelf &&
            (person.connectionStatus === "pending_incoming" ||
              person.connectionStatus === "blocked") ? (
              <ProfileSection title="Connections">
                <View
                  style={styles.relationshipCard}
                  testID="person-connection-relationship"
                >
                  <View style={styles.relationshipCopy}>
                    <Text style={styles.relationshipTitle}>
                      {connectionStatusLabel(person.connectionStatus)}
                    </Text>
                    <Text style={styles.relationshipDescription}>
                      Separate from any workspace you share.
                    </Text>
                  </View>
                  <View style={styles.connectionActionWrap}>
                    <ConnectionButton
                      status={person.connectionStatus}
                      isBlockedByMe={person.isBlockedByMe}
                      busy={busy}
                      onRequest={() => setConnectionConfirmation("request")}
                      onAccept={() => connectionAction.mutate("accept")}
                      onDecline={() => connectionAction.mutate("decline")}
                      onCancel={() => setConnectionConfirmation("cancel")}
                    />
                  </View>
                </View>
              </ProfileSection>
            ) : null;
          const scrollPadBottom = Math.max(insets.bottom, 16) + 24;

          if (twoColumn) {
            return (
              <View
                key="person-two-column"
                style={[
                  styles.profileSheet,
                  styles.splitBody,
                  {
                    paddingLeft: adaptive.contentPadLeft,
                    paddingRight: adaptive.contentPadRight,
                  },
                ]}
                testID="person-two-column"
              >
                <ScrollView
                  style={[
                    styles.identityColumn,
                    { width: identityColumnWidth },
                  ]}
                  contentContainerStyle={{
                    paddingTop: 48,
                    paddingBottom: scrollPadBottom,
                  }}
                  showsVerticalScrollIndicator={false}
                >
                  <ProfileIdentityCard person={person} actions={actionProps} />
                  {developmentWorkspace ? (
                    <ProfileDevelopmentShortcut
                      person={person}
                      workspace={developmentWorkspace}
                      onPress={() =>
                        router.push(
                          workspaceDevelopmentHref(developmentWorkspace.id, {
                            memberUserId: person.id,
                            section: "check-ins",
                          }),
                        )
                      }
                    />
                  ) : null}
                  <ProfileAboutSection person={person} />
                  {blockedNote}
                </ScrollView>
                <ScrollView
                  style={styles.detailColumn}
                  contentContainerStyle={{
                    paddingBottom: scrollPadBottom,
                    flexGrow: 1,
                    alignSelf: "stretch",
                  }}
                  showsVerticalScrollIndicator={false}
                >
                  {relationshipSection}
                  <PersonalOverviewContent
                    person={person}
                    showAbout={false}
                    showProfileAbout={false}
                    showHighlights={false}
                  />
                </ScrollView>
              </View>
            );
          }

          return (
            <ScrollView
              key="person-single-column"
              style={[styles.profileScroll, styles.phoneScroll]}
              contentContainerStyle={[
                styles.centredColumn,
                { paddingBottom: scrollPadBottom },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {/**
               * Transparent spacer lets the avatar sit on the cover; the white
               * body below is opaque so scrolled text never floats on the banner.
               */}
              <View style={styles.phoneSpacer} />
              <View style={styles.phoneBody}>
                <PhoneIdentity
                  person={person}
                  actions={actionProps}
                  onOpenConnections={() => {
                    if (person.isSelf) {
                      router.push({
                        pathname: "/(app)/team",
                        params: { tab: "connections" },
                      });
                      return;
                    }
                    setMutualOpen(true);
                  }}
                  onOpenWorkspaces={() =>
                    setWorkspaceSheetSignal((current) => current + 1)
                  }
                />
                {developmentWorkspace ? (
                  <ProfileDevelopmentShortcut
                    person={person}
                    workspace={developmentWorkspace}
                    onPress={() =>
                      router.push(
                        workspaceDevelopmentHref(developmentWorkspace.id, {
                          memberUserId: person.id,
                          section: "check-ins",
                        }),
                      )
                    }
                  />
                ) : null}
                {blockedNote}
                {relationshipSection}
                <PersonalOverviewContent
                  person={person}
                  showAbout={false}
                  showHighlights={false}
                  workspaceSheetSignal={workspaceSheetSignal}
                />
              </View>
            </ScrollView>
          );
        })()
      )}

      <Modal
        visible={connectionConfirmation != null}
        transparent
        animationType="fade"
        onRequestClose={() => setConnectionConfirmation(null)}
      >
        <Pressable
          style={styles.confirmationBackdrop}
          onPress={() => setConnectionConfirmation(null)}
          testID="personal-connection-confirmation-backdrop"
        >
          <Pressable
            style={styles.confirmationCard}
            onPress={(event) => event.stopPropagation()}
            testID="personal-connection-confirmation"
          >
            <LinearGradient
              colors={["#EEF2FF", "#F5F0FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.confirmationIcon}
            >
              {connectionConfirmation === "cancel" ? (
                <Clock size={22} color="#5B42F3" strokeWidth={2.2} />
              ) : (
                <UserPlus size={22} color="#5B42F3" strokeWidth={2.2} />
              )}
            </LinearGradient>
            <Text style={styles.confirmationEyebrow}>PERSONAL CONNECTION</Text>
            <Text style={styles.confirmationTitle}>
              {connectionConfirmation === "cancel"
                ? "Cancel this request?"
                : "Add personal connection?"}
            </Text>
            <Text style={styles.confirmationBody}>
              {connectionConfirmation === "cancel"
                ? `${person?.name ?? "This person"} will no longer see your pending request. You can reconnect later.`
                : `Send ${person?.name ?? "this person"} a personal connection request. This will not change workspace access.`}
            </Text>
            <View style={styles.confirmationActions}>
              <Pressable
                onPress={() => setConnectionConfirmation(null)}
                style={styles.confirmationSecondary}
                accessibilityRole="button"
                testID="personal-connection-confirmation-dismiss"
              >
                <Text style={styles.confirmationSecondaryText}>
                  {connectionConfirmation === "cancel"
                    ? "Keep request"
                    : "Not now"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const action =
                    connectionConfirmation === "cancel" ? "remove" : "request";
                  setConnectionConfirmation(null);
                  connectionAction.mutate(action);
                }}
                disabled={connectionAction.isPending}
                style={styles.confirmationPrimary}
                accessibilityRole="button"
                testID="personal-connection-confirmation-submit"
              >
                {connectionConfirmation === "cancel" ? (
                  <Clock size={15} color="#FFFFFF" strokeWidth={2.2} />
                ) : (
                  <UserPlus size={15} color="#FFFFFF" strokeWidth={2.2} />
                )}
                <Text style={styles.confirmationPrimaryText}>
                  {connectionConfirmation === "cancel"
                    ? "Cancel request"
                    : "Send request"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <AlenioBottomSheet
        visible={menuOpen}
        title={person?.name ? `Manage ${person.name}` : "Profile options"}
        subtitle={
          person
            ? [
                person.username ? `@${person.username}` : null,
                connectionStatusLabel(person.connectionStatus),
              ]
                .filter(Boolean)
                .join(" · ")
            : "Manage this connection"
        }
        onClose={() => setMenuOpen(false)}
        compact
        showCloseButton
        testID="person-options-sheet"
        footer={
          <Pressable
            onPress={() => setMenuOpen(false)}
            style={alenioSheetStyles.cancelButton}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        }
      >
        {manageableWorkspaces.length > 0 ? (
          <>
            <Text style={styles.menuGroupLabel}>
              {manageableWorkspaces.length === 1
                ? "Workspace"
                : `Workspaces · ${manageableWorkspaces.length}`}
            </Text>
            <AlenioSheetCard tint="slate" compact style={styles.menuCard}>
              {manageableWorkspaces.map((workspace, index) => (
                <React.Fragment key={workspace.id}>
                  {index > 0 ? <View style={styles.menuDivider} /> : null}
                  <MenuRow
                    icon={Users}
                    label={`Manage in ${workspace.name}`}
                    detail={`${formatTeamRole(workspace.role) || "Member"} · Change their role or remove their access`}
                    onPress={() => manageWorkspaceMembership(workspace)}
                    testID={
                      index === 0
                        ? "person-manage-workplace-membership"
                        : `person-manage-workplace-membership-${workspace.id}`
                    }
                  />
                </React.Fragment>
              ))}
            </AlenioSheetCard>
          </>
        ) : null}

        <Text style={styles.menuGroupLabel}>Connection</Text>
        <AlenioSheetCard tint="slate" compact style={styles.menuCard}>
          {person?.connectionStatus === "connected" ? (
            <>
              <MenuRow
                icon={UserMinus}
                label="Remove connection"
                detail="Chat history stays; workspace access unchanged"
                onPress={() =>
                  confirmDestructive(
                    "remove",
                    "Remove connection",
                    `${person.name ?? "This person"} will no longer be one of your connections. Chat history stays — delete the conversation from the chat if you want it gone. Shared workspace access is unchanged.`,
                  )
                }
                testID="person-remove-connection"
              />
              <View style={styles.menuDivider} />
            </>
          ) : null}
          {person?.isBlockedByMe ? (
            <MenuRow
              icon={Ban}
              label="Unblock"
              detail="They can message and connect with you again"
              onPress={() => {
                setMenuOpen(false);
                unblockMutation.mutate();
              }}
              testID="person-unblock"
            />
          ) : (
            <MenuRow
              icon={Ban}
              label="Block"
              detail="Stops messages and connection requests"
              destructive
              onPress={() =>
                confirmDestructive(
                  "block",
                  "Block this person",
                  "They will not be able to message you or send you a connection request. Shared workspace access is unchanged.",
                )
              }
              testID="person-block"
            />
          )}
        </AlenioSheetCard>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={connectionDestructiveConfirm != null}
        title={connectionDestructiveConfirm?.title ?? "Update connection"}
        subtitle="Connection settings"
        onClose={() => {
          if (connectionAction.isPending) return;
          setConnectionDestructiveConfirm(null);
        }}
        compact
        showCloseButton
        testID="person-connection-destructive-confirmation"
        footer={
          <View style={styles.membershipConfirmActions}>
            <Pressable
              onPress={() => setConnectionDestructiveConfirm(null)}
              disabled={connectionAction.isPending}
              style={styles.membershipKeepButton}
            >
              <Text style={styles.membershipKeepButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!connectionDestructiveConfirm) return;
                connectionAction.mutate(connectionDestructiveConfirm.action);
              }}
              disabled={
                connectionAction.isPending || !connectionDestructiveConfirm
              }
              style={styles.membershipRemoveButton}
            >
              <Text style={styles.membershipRemoveButtonText}>
                {connectionAction.isPending
                  ? "Updating…"
                  : connectionDestructiveConfirm?.action === "block"
                    ? "Block"
                    : "Remove"}
              </Text>
            </Pressable>
          </View>
        }
      >
        <AlenioSheetCard tint="danger" compact>
          <View style={styles.membershipWarning}>
            <View style={styles.membershipWarningIcon}>
              {connectionDestructiveConfirm?.action === "block" ? (
                <Ban size={17} color="#DC2626" strokeWidth={2.2} />
              ) : (
                <UserMinus size={17} color="#DC2626" strokeWidth={2.2} />
              )}
            </View>
            <Text style={styles.membershipWarningText}>
              {connectionDestructiveConfirm?.message}
            </Text>
          </View>
        </AlenioSheetCard>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={membershipManagerOpen}
        title="Manage workspace member"
        subtitle={managedWorkspace?.name ?? "Workspace"}
        onClose={() => {
          if (workplaceMembershipMutation.isPending) return;
          setMembershipManagerOpen(false);
        }}
        compact
        showCloseButton
        testID="person-workspace-membership-sheet"
        footer={
          <Pressable
            onPress={() => setMembershipManagerOpen(false)}
            disabled={workplaceMembershipMutation.isPending}
            style={alenioSheetStyles.cancelButton}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        }
      >
        {managedWorkspace ? (
          <>
            {managedRole === "owner" ? (
              <MembershipRoleSwitcher
                role={
                  managedWorkspace.role === "team_leader"
                    ? "team_leader"
                    : "member"
                }
                pending={workplaceMembershipMutation.isPending}
                onSelect={(role) => {
                  setMembershipManagerOpen(false);
                  setTimeout(() => setRoleChangeConfirm(role), 180);
                }}
              />
            ) : null}
            <Pressable
              onPress={() => {
                setMembershipManagerOpen(false);
                setTimeout(() => setMembershipRemoveConfirmOpen(true), 180);
              }}
              disabled={workplaceMembershipMutation.isPending}
              style={styles.membershipRemoveRow}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${person?.name ?? "this person"} from ${managedWorkspace.name}`}
              testID="person-remove-workspace-member"
            >
              <UserMinus size={15} color="#DC2626" strokeWidth={2.2} />
              <Text style={styles.membershipRemoveRowText}>
                Remove from workspace
              </Text>
            </Pressable>
          </>
        ) : null}
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={roleChangeConfirm != null}
        title={
          roleChangeConfirm === "team_leader"
            ? "Make team leader?"
            : "Change to member?"
        }
        subtitle={managedWorkspace?.name ?? "Workspace"}
        onClose={() => {
          if (workplaceMembershipMutation.isPending) return;
          setRoleChangeConfirm(null);
        }}
        compact
        showCloseButton
        testID="person-role-change-confirmation"
        footer={
          <View style={styles.membershipConfirmActions}>
            <Pressable
              onPress={() => setRoleChangeConfirm(null)}
              disabled={workplaceMembershipMutation.isPending}
              style={styles.membershipKeepButton}
            >
              <Text style={styles.membershipKeepButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!managedWorkspace || !roleChangeConfirm) return;
                workplaceMembershipMutation.mutate({
                  teamId: managedWorkspace.id,
                  action: "role",
                  role: roleChangeConfirm,
                });
              }}
              disabled={
                workplaceMembershipMutation.isPending ||
                !managedWorkspace ||
                !roleChangeConfirm
              }
              style={styles.membershipConfirmButton}
            >
              <Text style={styles.membershipConfirmButtonText}>
                {workplaceMembershipMutation.isPending
                  ? "Updating…"
                  : "Change role"}
              </Text>
            </Pressable>
          </View>
        }
      >
        <AlenioSheetCard tint="slate" compact>
          <View style={styles.membershipWarning}>
            <View style={styles.roleConfirmIcon}>
              {roleChangeConfirm === "team_leader" ? (
                <ShieldCheck size={17} color={BRAND} strokeWidth={2.2} />
              ) : (
                <Users size={17} color={BRAND} strokeWidth={2.2} />
              )}
            </View>
            <Text style={styles.roleConfirmText}>
              {roleChangeConfirm === "team_leader"
                ? `${person?.name ?? "This person"} will be able to lead members, run check-ins, and manage activity in ${managedWorkspace?.name ?? "this workspace"}.`
                : `${person?.name ?? "This person"} will lose team leader tools in ${managedWorkspace?.name ?? "this workspace"} and keep standard member access.`}
            </Text>
          </View>
        </AlenioSheetCard>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={membershipRemoveConfirmOpen}
        title="Remove workspace member?"
        subtitle={managedWorkspace?.name ?? "Workspace"}
        onClose={() => {
          if (workplaceMembershipMutation.isPending) return;
          setMembershipRemoveConfirmOpen(false);
        }}
        compact
        showCloseButton
        testID="person-remove-workspace-member-confirmation"
        footer={
          <View style={styles.membershipConfirmActions}>
            <Pressable
              onPress={() => setMembershipRemoveConfirmOpen(false)}
              disabled={workplaceMembershipMutation.isPending}
              style={styles.membershipKeepButton}
            >
              <Text style={styles.membershipKeepButtonText}>Keep member</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!managedWorkspace) return;
                workplaceMembershipMutation.mutate({
                  teamId: managedWorkspace.id,
                  action: "remove",
                });
              }}
              disabled={
                workplaceMembershipMutation.isPending || !managedWorkspace
              }
              style={styles.membershipRemoveButton}
            >
              <Text style={styles.membershipRemoveButtonText}>
                {workplaceMembershipMutation.isPending ? "Removing…" : "Remove"}
              </Text>
            </Pressable>
          </View>
        }
      >
        <AlenioSheetCard tint="danger" compact>
          <View style={styles.membershipWarning}>
            <View style={styles.membershipWarningIcon}>
              <UserMinus size={17} color="#DC2626" strokeWidth={2.2} />
            </View>
            <Text style={styles.membershipWarningText}>
              {person?.name ?? "This person"} will lose access to{" "}
              {managedWorkspace?.name ?? "this workspace"}. Their Alenio account
              will remain active.
            </Text>
          </View>
        </AlenioSheetCard>
      </AlenioBottomSheet>
      {person && !person.isSelf ? (
        <MutualConnectionsSheet
          visible={mutualOpen}
          personId={person.id}
          personName={person.name ?? ""}
          onClose={() => setMutualOpen(false)}
        />
      ) : null}
    </View>
  );
}

function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.skeletonBlock, style]} />;
}

function ProfileLoadingSkeleton({ bottomInset }: { bottomInset: number }) {
  const pulse = useRef(new Animated.Value(0.58)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.58,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View
      style={styles.profileScroll}
      accessibilityLabel="Loading profile details"
      testID="person-profile-skeleton"
    >
      <Animated.View
        style={[
          styles.content,
          styles.skeletonContent,
          { paddingBottom: Math.max(bottomInset, 16) + 24, opacity: pulse },
        ]}
      >
        <View style={styles.skeletonActions}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.skeletonAction}>
              <SkeletonBlock style={styles.skeletonActionCircle} />
              <SkeletonBlock style={styles.skeletonActionLabel} />
            </View>
          ))}
        </View>

        <SkeletonBlock style={styles.skeletonSectionLabel} />
        <View style={styles.skeletonCard}>
          {[0, 1].map((item) => (
            <View key={item} style={styles.skeletonInfoRow}>
              <SkeletonBlock style={styles.skeletonInfoIcon} />
              <View style={styles.skeletonInfoCopy}>
                <SkeletonBlock style={styles.skeletonInfoPrimary} />
                <SkeletonBlock style={styles.skeletonInfoSecondary} />
              </View>
            </View>
          ))}
        </View>

        <SkeletonBlock style={[styles.skeletonSectionLabel, { width: 74 }]} />
        <View style={styles.skeletonCard}>
          <SkeletonBlock style={styles.skeletonAboutLine} />
          <SkeletonBlock style={[styles.skeletonAboutLine, { width: "91%" }]} />
          <SkeletonBlock style={[styles.skeletonAboutLine, { width: "68%" }]} />
        </View>
      </Animated.View>
    </View>
  );
}

function PhoneActionRow({
  onShare,
  ...props
}: ProfileActionsProps & { onShare: () => void }) {
  if (props.isSelf) {
    return (
      <View style={styles.phoneActions}>
        <Pressable
          onPress={onShare}
          style={styles.phoneIconButton}
          accessibilityRole="button"
          accessibilityLabel="Share profile"
          testID="person-share-button"
        >
          <Share2 size={16} color="#111A2B" strokeWidth={2.1} />
        </Pressable>
      </View>
    );
  }

  const actions = profileActions(props);
  const more = actions.find((action) => action.label === "More");
  const rest = actions.filter(
    (action) => action.label !== "More" && action.label !== "Connected",
  );
  const relationship = rest.find((action) => action.label !== "Message");
  const message = rest.find((action) => action.label === "Message");
  const primary = relationship ?? message;
  const messageBeside = message && primary !== message ? message : null;

  return (
    <View style={styles.phoneActions}>
      {messageBeside ? (
        <Pressable
          onPress={messageBeside.onPress}
          disabled={messageBeside.disabled}
          style={[
            styles.phoneIconButton,
            messageBeside.disabled ? styles.phoneActionDisabled : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={messageBeside.label}
          testID={`person-quick-action-${messageBeside.label.toLowerCase()}`}
        >
          <MessageSquare size={16} color={BRAND} strokeWidth={2.1} />
        </Pressable>
      ) : null}
      {primary ? (
        <Pressable
          onPress={primary.onPress}
          disabled={primary.disabled}
          style={[
            styles.phonePill,
            primary.disabled ? styles.phoneActionDisabled : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          testID={`person-quick-action-${primary.label.toLowerCase()}`}
        >
          <Text style={styles.phonePillText}>{primary.label}</Text>
        </Pressable>
      ) : null}
      {more ? (
        <Pressable
          onPress={more.onPress}
          style={styles.phoneIconButton}
          accessibilityRole="button"
          accessibilityLabel="More"
          testID="person-quick-action-more"
        >
          <MoreHorizontal size={16} color="#111A2B" strokeWidth={2.1} />
        </Pressable>
      ) : null}
    </View>
  );
}

function PhoneIdentity({
  person,
  actions,
  onOpenConnections,
  onOpenWorkspaces,
}: {
  person: PublicPersonProfile;
  actions: ProfileActionsProps;
  onOpenConnections: () => void;
  onOpenWorkspaces: () => void;
}) {
  const location = person.profileLocation?.trim() ?? "";
  const connectionCount = person.stats?.connections ?? 0;
  const connectionLabel =
    connectionCount === 1 ? "1 connection" : `${connectionCount} connections`;
  const workspaceCount = person.stats?.workspaces ?? 0;
  const workspaceLabel =
    workspaceCount === 1 ? "1 workspace" : `${workspaceCount} workspaces`;
  const canOpenWorkspaces = person.sharedWorkspaces.length > 0;
  const role = formatCurrentRole(person.profileTitle, person.profileOrganization);
  const share = () => {
    const name = person.name ?? "Alenio member";
    const handle = person.username ? ` (@${person.username})` : "";
    void Share.share({ message: `${name}${handle} on Alenio` });
  };

  return (
    <View style={styles.phoneCard}>
      <View style={styles.phoneAvatarWrap}>
        <UserAvatar
          user={{
            name: person.name,
            image: person.image,
            isWorkplaceConnected: person.isWorkplaceConnected,
          }}
          size={72}
          radius={36}
          backgroundColor="#6366F1"
          textColor="#FFFFFF"
          fontSize={26}
          workplaceConnectedInteractive
        />
      </View>
      <View style={styles.phoneIdentityRow}>
        <View style={styles.phoneIdentityCopy}>
          <View style={styles.phoneNameRow}>
            <Text style={styles.phoneName} numberOfLines={1}>
              {person.name ?? "Alenio member"}
            </Text>
            {person.emailVerified ? (
              <View style={styles.phoneVerified}>
                <Check size={11} color="#FFFFFF" strokeWidth={3} />
              </View>
            ) : null}
          </View>
        </View>
        <PhoneActionRow {...actions} onShare={share} />
      </View>
      {role ? (
        <Text style={styles.phoneTitle} numberOfLines={1}>
          {role}
        </Text>
      ) : null}
      {person.username || person.memberSince ? (
        <Text style={styles.phoneMeta} numberOfLines={1}>
          {person.username ? (
            <Text style={styles.phoneHandle}>@{person.username}</Text>
          ) : null}
          {person.username && person.memberSince ? " · " : null}
          {person.memberSince
            ? `Joined ${formatMemberSince(person.memberSince)}`
            : null}
        </Text>
      ) : null}
      <View style={styles.phoneFacts}>
        {location ? (
          <View style={styles.phoneFact}>
            <MapPin size={14} color="#98A2B3" strokeWidth={2.2} />
            <Text style={styles.phoneFactText} numberOfLines={1}>
              {location}
            </Text>
          </View>
        ) : null}
        {location ? <Text style={styles.phoneFactDot}>·</Text> : null}
        <Pressable
          onPress={onOpenConnections}
          style={styles.phoneFact}
          accessibilityRole="button"
          accessibilityLabel={connectionLabel}
          testID="profile-stat-connections"
        >
          <Users size={14} color="#98A2B3" strokeWidth={2.2} />
          <Text style={styles.phoneFactText}>{connectionLabel}</Text>
        </Pressable>
        <Text style={styles.phoneFactDot}>·</Text>
        <Pressable
          onPress={canOpenWorkspaces ? onOpenWorkspaces : undefined}
          disabled={!canOpenWorkspaces}
          style={styles.phoneFact}
          accessibilityRole={canOpenWorkspaces ? "button" : undefined}
          accessibilityLabel={workspaceLabel}
          testID="profile-stat-workspaces"
        >
          <Layers size={14} color="#98A2B3" strokeWidth={2.2} />
          <Text style={styles.phoneFactText}>{workspaceLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ProfileActionsProps = {
  isSelf: boolean;
  canMessage: boolean;
  blocked: boolean;
  connectionStatus: ConnectionStatus;
  busy: boolean;
  onMessage: () => void;
  onEdit: () => void;
  onMore: () => void;
  onCancelRequest: () => void;
  onRequestConnection: () => void;
};

type ProfileAction = {
  label: string;
  icon: typeof MessageSquare;
  onPress: () => void;
  disabled: boolean;
  connected?: boolean;
  emphasized?: boolean;
};

/**
 * One list behind both presentations — a row of circles on a phone and a stack
 * of labelled buttons in the wide identity card — so a status only has to be
 * handled once.
 */
function profileActions({
  isSelf,
  canMessage,
  blocked,
  connectionStatus,
  busy,
  onMessage,
  onMore,
  onCancelRequest,
  onRequestConnection,
}: ProfileActionsProps): ProfileAction[] {
  const actions: ProfileAction[] = isSelf
    ? []
    : [
        {
          label: blocked ? "Blocked" : "Message",
          icon: MessageSquare,
          onPress: canMessage ? onMessage : () => {},
          disabled: busy || !canMessage,
        },
        {
          label: "More",
          icon: MoreHorizontal,
          onPress: onMore,
          disabled: false,
        },
      ];
  if (!isSelf && connectionStatus === "connected") {
    actions.splice(1, 0, {
      label: "Connected",
      icon: Check,
      onPress: onMore,
      disabled: false,
      connected: true,
    });
  } else if (!isSelf && connectionStatus === "pending_outgoing") {
    actions.splice(1, 0, {
      label: "Requested",
      icon: Clock,
      onPress: onCancelRequest,
      disabled: busy,
    });
  } else if (
    !isSelf &&
    !blocked &&
    (connectionStatus === "none" || connectionStatus === "declined")
  ) {
    actions.splice(1, 0, {
      label: "Connect",
      icon: UserPlus,
      onPress: onRequestConnection,
      disabled: busy,
      emphasized: true,
    });
  }
  return actions;
}

/**
 * The identity a wide screen leads with. The gradient hero puts a portrait and
 * a name against a field of empty colour once the window is a thousand points
 * across, so here the same details become the first card of a left column, on
 * white, with the actions labelled instead of reduced to icons.
 */
function ProfileIdentityCard({
  person,
  actions,
}: {
  person: PublicPersonProfile;
  actions: ProfileActionsProps;
}) {
  const role = formatCurrentRole(person.profileTitle, person.profileOrganization);
  return (
    <View style={styles.identityCard} testID="person-identity-card">
      <View style={styles.identityAvatarWrap}>
        <UserAvatar
          user={{
            name: person.name,
            image: person.image,
            isWorkplaceConnected: person.isWorkplaceConnected,
          }}
          size={96}
          radius={48}
          backgroundColor="#6366F1"
          textColor="#FFFFFF"
          fontSize={34}
          workplaceConnectedInteractive
        />
      </View>
      <Text style={styles.identityName} numberOfLines={2}>
        {person.name ?? "Alenio member"}
      </Text>
      {role ? (
        <Text style={styles.identityTitle} numberOfLines={1}>
          {role}
        </Text>
      ) : null}
      {person.username ? (
        <Text style={styles.identityUsername} numberOfLines={1}>
          @{person.username}
        </Text>
      ) : null}
      {person.profileLocation?.trim() ? (
        <View style={styles.identityMetaItem}>
          <MapPin size={12} color="#8794A8" strokeWidth={2.4} />
          <Text style={styles.identityUsername} numberOfLines={1}>
            {person.profileLocation.trim()}
          </Text>
        </View>
      ) : null}
      {person.emailVerified ? (
        <View style={styles.identityVerified}>
          <ShieldCheck size={11} color={BRAND} strokeWidth={2.6} />
          <Text style={styles.identityVerifiedText}>Verified</Text>
        </View>
      ) : null}
      <StackedActions {...actions} />
    </View>
  );
}

function StackedActions(props: ProfileActionsProps) {
  const actions = profileActions(props);
  if (actions.length === 0) return null;
  const [primary, ...rest] = actions;
  const PrimaryIcon = primary?.icon;

  return (
    <View style={styles.stackedActions}>
      {primary && PrimaryIcon ? (
        <Pressable
          onPress={primary.onPress}
          disabled={primary.disabled}
          style={[
            styles.stackedPrimary,
            primary.disabled ? styles.stackedActionDisabled : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          testID={`person-stacked-action-${primary.label.toLowerCase()}`}
        >
          <LinearGradient
            colors={["#5B7CFF", BRAND]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.stackedPrimaryFill}
          >
            <PrimaryIcon size={16} color="#FFFFFF" strokeWidth={2.3} />
            <Text style={styles.stackedPrimaryLabel}>{primary.label}</Text>
          </LinearGradient>
        </Pressable>
      ) : null}
      {rest.length > 0 ? (
        <View style={styles.stackedSecondaryRow}>
          {rest.map((action) => {
            const Icon = action.icon;
            const ink = action.connected
              ? "#0F8A5A"
              : action.emphasized
                ? BRAND
                : "#344054";
            const moreOnly = action.label === "More";
            return (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                disabled={action.disabled}
                style={[
                  moreOnly ? styles.stackedMore : styles.stackedSecondary,
                  action.connected
                    ? styles.stackedActionConnected
                    : action.emphasized
                      ? styles.stackedActionTinted
                      : styles.stackedActionPlain,
                  action.disabled ? styles.stackedActionDisabled : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                testID={`person-stacked-action-${action.label.toLowerCase()}`}
              >
                <Icon size={moreOnly ? 18 : 15} color={ink} strokeWidth={2.2} />
                {moreOnly ? null : (
                  <Text
                    style={[styles.stackedSecondaryLabel, { color: ink }]}
                    numberOfLines={1}
                  >
                    {action.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function AboutDetailsCard({
  person,
  plain = false,
}: {
  person: PublicPersonProfile;
  /** Drops the frame for callers that already put it inside a card. */
  plain?: boolean;
}) {
  return (
    <ProfileSection
      title="About"
      style={plain ? styles.plainSection : undefined}
    >
      <View style={plain ? styles.infoCardPlain : styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <Clock size={16} color={BRAND} />
          </View>
          <View style={styles.infoCopy}>
            <Text style={styles.infoPrimary}>Joined Alenio</Text>
            <Text style={styles.infoSecondary}>
              {formatMemberSince(person.memberSince)}
            </Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <FileText size={16} color="#718097" strokeWidth={2} />
          </View>
          {person.profileBio ? (
            <Text style={styles.infoBio}>{person.profileBio}</Text>
          ) : (
            <Text style={styles.infoBioEmpty}>No summary added yet.</Text>
          )}
        </View>
      </View>
    </ProfileSection>
  );
}

function profileFirstName(person: PublicPersonProfile): string {
  const first = person.name?.trim().split(/\s+/)[0];
  if (first) return first;
  return person.isSelf ? "you" : "them";
}

function ProfileDevelopmentShortcut({
  person,
  workspace,
  onPress,
}: {
  person: PublicPersonProfile;
  workspace: PublicProfileWorkspace;
  onPress: () => void;
}) {
  const label = person.isSelf ? "My development" : "View development";
  const description = person.isSelf
    ? `Open your goals and check-ins in ${workspace.name}.`
    : `Open ${profileFirstName(person)}'s goals and check-ins in ${workspace.name}.`;

  return (
    <View
      style={styles.developmentShortcutSection}
      testID="profile-development-shortcut"
    >
      <Text style={styles.developmentShortcutHeading}>Development</Text>
      <Pressable
        onPress={onPress}
        style={styles.developmentShortcut}
        accessibilityRole="button"
        accessibilityLabel={`${label} in ${workspace.name}`}
      >
        <View style={styles.developmentShortcutIcon}>
          <Target size={18} color={BRAND} strokeWidth={2.3} />
        </View>
        <View style={styles.developmentShortcutCopy}>
          <Text style={styles.developmentShortcutTitle}>{label}</Text>
          <Text style={styles.developmentShortcutText} numberOfLines={2}>
            {description}
          </Text>
        </View>
        <ChevronRight size={17} color="#98A2B3" strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function ProfileAboutSection({ person }: { person: PublicPersonProfile }) {
  const bio = person.profileBio?.trim() ?? "";
  const showAddBio = person.isSelf && !bio;

  return (
    <View style={styles.aboutSection} testID="profile-about-section">
      <View style={styles.aboutHeader}>
        <UserRound size={14} color="#111A2B" strokeWidth={2.2} />
        <Text style={styles.aboutHeading}>About {profileFirstName(person)}</Text>
      </View>
      <View style={styles.aboutCard}>
        {bio ? <Text style={styles.aboutBio}>{bio}</Text> : null}
        {showAddBio ? (
          <Pressable
            onPress={() => router.push("/edit-profile")}
            style={styles.aboutAdd}
            accessibilityRole="button"
            accessibilityLabel="Add bio"
            testID="profile-about-add-bio"
          >
            <Text style={styles.aboutAddText}>Add bio</Text>
          </Pressable>
        ) : null}
        {!bio && !showAddBio ? (
          <Text style={styles.aboutEmpty}>No about yet</Text>
        ) : null}
      </View>
    </View>
  );
}

function PersonalOverviewContent({
  person,
  showHighlights = false,
  showAbout = true,
  showProfileAbout = true,
  workspaceSheetSignal = 0,
}: {
  person: PublicPersonProfile;
  showHighlights?: boolean;
  /** False in the wide layout, where About lives in the identity column. */
  showAbout?: boolean;
  /** The phone-style About block. Wide layout places it under the profile. */
  showProfileAbout?: boolean;
  /** Incremented to open the workspace list. */
  workspaceSheetSignal?: number;
}) {
  return (
    <>
      {showAbout ? <AboutDetailsCard person={person} /> : null}
      {showHighlights ? <HighlightsCard person={person} /> : null}
      {showProfileAbout ? <ProfileAboutSection person={person} /> : null}
      <ProfileActivitySection
        personId={person.id}
        personName={person.name ?? ""}
        isSelf={person.isSelf}
      />
      <SharedWorkspacesSection
        sheetOnly
        workspaces={person.sharedWorkspaces}
        personName={person.name ?? ""}
        openSignal={workspaceSheetSignal}
        onOpenWorkspace={(workspace) =>
          router.push({
            pathname: "/public-workspace",
            params: { teamId: workspace.id, teamName: workspace.name },
          })
        }
      />
    </>
  );
}

function HighlightsCard({ person }: { person: PublicPersonProfile }) {
  const connected = person.connectionStatus === "connected";
  const connections = {
    value: String(person.stats?.connections ?? 0),
    label: "Connections",
    icon: Users,
    color: BRAND,
  };
  const workspaces = {
    value: String(person.stats?.workspaces ?? 0),
    label: person.stats?.workspaces === 1 ? "Workspace" : "Workspaces",
    icon: Building2,
    color: "#F59E0B",
  };
  /** Status and mutuals are meaningless on your own profile, so swap in workspaces. */
  const highlights = person.isSelf
    ? [connections, workspaces]
    : [
        {
          value: connected ? "Connected" : "—",
          label: "Current status",
          icon: Check,
          color: "#16A366",
        },
        connections,
        {
          value: String(person.stats?.mutualConnections ?? 0),
          label: "Mutual",
          icon: Target,
          color: "#7C3AED",
        },
      ];

  return (
    <ProfileSection title="Highlights">
      <View style={styles.highlightsCard}>
        {highlights.map((item) => {
          const Icon = item.icon;
          return (
            <View key={item.label} style={styles.highlightItem}>
              <Icon size={16} color={item.color} strokeWidth={2.2} />
              <Text style={styles.highlightValue} numberOfLines={1}>
                {item.value}
              </Text>
              <Text style={styles.highlightLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </ProfileSection>
  );
}

function ProfileSection({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ActionButton({
  label,
  icon: Icon,
  primary,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  icon: typeof Pencil;
  primary?: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionButton,
        primary ? styles.primaryAction : styles.secondaryAction,
      ]}
      testID={testID}
    >
      <Icon size={16} color={primary ? "#FFFFFF" : BRAND} strokeWidth={2.25} />
      <Text
        style={[styles.actionLabel, { color: primary ? "#FFFFFF" : BRAND }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ConnectionButton({
  status,
  isBlockedByMe,
  busy,
  onRequest,
  onAccept,
  onDecline,
  onCancel,
}: {
  status: ConnectionStatus;
  isBlockedByMe: boolean;
  busy: boolean;
  onRequest: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  if (isBlockedByMe) {
    return (
      <View style={styles.blockedState}>
        <Text style={styles.blockedText}>Blocked</Text>
      </View>
    );
  }
  if (status === "pending_incoming") {
    return (
      <View style={styles.pairedActions}>
        <ActionButton
          label="Accept"
          icon={Check}
          primary
          onPress={onAccept}
          disabled={busy}
        />
        <ActionButton
          label="Decline"
          icon={UserMinus}
          onPress={onDecline}
          disabled={busy}
        />
      </View>
    );
  }
  if (status === "pending_outgoing") {
    return (
      <ActionButton
        label="Requested"
        icon={Clock}
        onPress={onCancel}
        disabled={busy}
      />
    );
  }
  if (status === "connected") return null;
  return (
    <ActionButton
      label="Connect"
      icon={UserPlus}
      primary
      onPress={onRequest}
      disabled={busy}
    />
  );
}

const MEMBERSHIP_ROLES = [
  {
    key: "member" as const,
    label: "Member",
    icon: Users,
    blurb: "Standard workspace access. Can join activity and see shared work.",
  },
  {
    key: "team_leader" as const,
    label: "Team leader",
    icon: ShieldCheck,
    blurb:
      "Can lead members, run check-ins, and manage workspace activity. Cannot change billing or remove the owner.",
  },
];

/** Segmented role picker: the whole choice reads at a glance, one tap to change. */
function MembershipRoleSwitcher({
  role,
  pending,
  onSelect,
}: {
  role: "member" | "team_leader";
  pending: boolean;
  onSelect: (role: "member" | "team_leader") => void;
}) {
  const active = MEMBERSHIP_ROLES.find((option) => option.key === role);
  return (
    <View style={styles.roleSwitcher}>
      <Text style={styles.roleSwitcherLabel}>Role in this workspace</Text>
      <View style={styles.roleTrack}>
        {MEMBERSHIP_ROLES.map((option) => {
          const selected = option.key === role;
          const Icon = option.icon;
          return (
            <Pressable
              key={option.key}
              onPress={() => {
                if (selected || pending) return;
                onSelect(option.key);
              }}
              disabled={pending}
              style={[
                styles.roleSegment,
                selected ? styles.roleSegmentSelected : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: pending }}
              testID={
                option.key === "member"
                  ? "person-set-workspace-member"
                  : "person-set-workspace-leader"
              }
            >
              <Icon
                size={15}
                color={selected ? BRAND : "#7B8798"}
                strokeWidth={2.3}
              />
              <Text
                style={[
                  styles.roleSegmentLabel,
                  selected ? styles.roleSegmentLabelSelected : null,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.roleBlurb}>
        {pending ? "Updating role…" : (active?.blurb ?? "")}
      </Text>
    </View>
  );
}

function MenuRow({
  icon: Icon,
  label,
  detail,
  onPress,
  destructive,
  testID,
}: {
  icon: typeof UserMinus;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.menuRow, pressed ? styles.menuRowPressed : null]}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      testID={testID}
    >
      <View
        style={[
          styles.menuIcon,
          destructive ? styles.menuIconDestructive : null,
        ]}
      >
        <Icon
          size={16}
          color={destructive ? "#DC2626" : BRAND}
          strokeWidth={2.2}
        />
      </View>
      <View style={styles.menuCopy}>
        <Text
          style={[
            styles.menuLabel,
            destructive ? styles.menuLabelDanger : null,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {detail ? (
          <Text style={styles.menuDetail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={15} color={destructive ? "#F0A3A3" : "#B6BECB"} />
    </Pressable>
  );
}

function connectionStatusLabel(status: ConnectionStatus): string {
  if (status === "connected") return "You are connected";
  if (status === "pending_incoming") return "Wants to connect";
  if (status === "pending_outgoing") return "Request pending";
  if (status === "blocked") return "Connection blocked";
  return "Not connected";
}

function formatCurrentRole(
  title?: string | null,
  employer?: string | null,
): string {
  const role = title?.trim() ?? "";
  const company = employer?.trim() ?? "";
  if (role && company) return `${role} at ${company}`;
  return role || company;
}

function formatMemberSince(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  cover: {
    overflow: "hidden",
    backgroundColor: "#E7E4F8",
    zIndex: 1,
  },
  /**
   * Sibling above the banner so Back stays tappable without trapping the
   * avatar under the cover's stacking context.
   */
  coverChrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    elevation: 4,
    justifyContent: "flex-start",
  },
  coverFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  /**
   * Pull the sheet up over the banner. Spacer keeps the avatar pull-up inside
   * the ScrollView; phoneBody is solid white so scrolled text never sits on
   * the cover.
   */
  phoneScroll: { marginTop: -38, backgroundColor: "transparent", zIndex: 2 },
  phoneSpacer: { height: 38 },
  phoneBody: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#FFFFFF",
  },
  phoneCard: { paddingTop: 0 },
  phoneAvatarWrap: {
    alignSelf: "flex-start",
    zIndex: 2,
    elevation: 4,
    marginTop: -38,
    marginLeft: 2,
    padding: 2,
    borderRadius: 40,
    backgroundColor: "#FFFFFF",
  },
  phoneIdentityRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  phoneIdentityCopy: { flex: 1, minWidth: 0 },
  phoneNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  phoneName: {
    flexShrink: 1,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#111A2B",
  },
  phoneVerified: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND,
  },
  phoneTitle: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: "#667085",
  },
  phoneMeta: { marginTop: 2, fontSize: 12, lineHeight: 16, color: "#667085" },
  phoneHandle: { fontWeight: "700", color: BRAND },
  phoneFacts: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  phoneFact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: "100%",
    flexShrink: 1,
  },
  phoneFactText: { fontSize: 12, lineHeight: 16, color: "#667085" },
  phoneFactDot: { fontSize: 12, lineHeight: 16, color: "#98A2B3" },
  phoneActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  phoneIconButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6E4F0",
  },
  phonePill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: BRAND,
  },
  phonePillText: { fontSize: 13, lineHeight: 16, fontWeight: "700", color: "#FFFFFF" },
  phoneActionDisabled: { opacity: 0.5 },
  developmentShortcutSection: {
    marginTop: 12,
  },
  developmentShortcutHeading: {
    marginBottom: 6,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  developmentShortcut: {
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DCD6FE",
    backgroundColor: "#F7F5FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  developmentShortcutIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDE9FE",
  },
  developmentShortcutCopy: {
    flex: 1,
    minWidth: 0,
  },
  developmentShortcutTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "800",
    color: "#251B69",
  },
  developmentShortcutText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#667085",
  },
  aboutSection: { marginTop: 12 },
  aboutHeader: {
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  aboutHeading: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  aboutCard: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4DFF8",
    backgroundColor: "#FFFFFF",
  },
  aboutBio: { fontSize: 13, lineHeight: 18, color: "#1F2937" },
  aboutEmpty: { fontSize: 13, lineHeight: 17, color: "#667085" },
  aboutAdd: { alignSelf: "flex-start", paddingVertical: 1 },
  aboutAddText: { fontSize: 13, lineHeight: 16, fontWeight: "700", color: BRAND },
  aboutDetail: { flex: 1, fontSize: 14, lineHeight: 18, color: "#344054" },
  blockedExplanation: {
    marginTop: -2,
    marginBottom: 10,
    paddingHorizontal: 16,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    color: "#64748B",
  },
  heroHeader: {
    paddingBottom: 29,
    overflow: "hidden",
  },
  /**
   * With identity in the left column the gradient is only a nav bar, but it
   * still needs the depth to read as the top of the page and to give the
   * watermark something to sit in.
   */
  heroHeaderCompact: {
    /** The sheet above pulls 22 back, so this is ~26pt of visible gradient. */
    paddingBottom: 48,
  },
  /**
   * Past this a row is a short line of text with several hundred points of
   * nothing beside it, so wide single-column screens centre the reading column
   * rather than stretching every card to the window.
   */
  centredColumn: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
  },
  splitBody: {
    flexDirection: "row",
    paddingTop: 0,
    gap: PROFILE_COLUMN_GAP,
  },
  identityColumn: {
    flexGrow: 0,
    flexShrink: 0,
  },
  detailColumn: {
    flex: 1,
    minWidth: 0,
  },
  identityCard: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 6,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: "#FFFFFF",
  },
  identityAvatarWrap: {
    zIndex: 2,
    elevation: 4,
    marginTop: -48,
    padding: 3,
    borderRadius: 54,
    backgroundColor: "#FFFFFF",
  },
  identityName: {
    marginTop: 12,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#1B2437",
    textAlign: "center",
  },
  identityTitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#536175",
    textAlign: "center",
  },
  identityUsername: {
    marginTop: 3,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
    color: "#8794A8",
  },
  identityMetaItem: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  identityVerified: {
    marginTop: 9,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  identityVerifiedText: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: BRAND,
  },
  stackedActions: {
    width: "100%",
    marginTop: 18,
    gap: 10,
  },
  stackedPrimary: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#2F4FD0",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  stackedPrimaryFill: {
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stackedPrimaryLabel: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: "#FFFFFF",
  },
  stackedSecondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stackedSecondary: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stackedMore: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stackedActionConnected: {
    backgroundColor: "#F3FBF7",
    borderColor: "#D7F0E4",
  },
  stackedActionTinted: {
    backgroundColor: "#F4F6FF",
    borderColor: "#E0E6FF",
  },
  stackedActionPlain: {
    backgroundColor: "#FAFBFD",
    borderColor: "#E8ECF3",
  },
  stackedActionDisabled: {
    opacity: 0.55,
  },
  stackedSecondaryLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  identityDivider: {
    width: "100%",
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    backgroundColor: "#E8ECF3",
  },
  /** Inside the identity card the section owns neither a frame nor a gutter. */
  plainSection: {
    width: "100%",
    marginTop: 14,
  },
  infoCardPlain: {
    paddingVertical: 0,
  },
  /** Monochrome Alenio mark bleeding off the right edge of the gradient. */
  heroWatermark: {
    position: "absolute",
    right: -30,
    /** Anchored to the bottom of the hero so the mark bleeds off the lower edge. */
    bottom: 1,
    width: 168,
    height: 168,
    opacity: 0.11,
    tintColor: "#FFFFFF",
    transform: [{ rotate: "-8deg" }],
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroPlaceholder: { height: 92 },
  heroSkeletonAvatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  heroSkeletonLine: {
    width: "58%",
    height: 15,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.46)",
  },
  heroSkeletonLineSmall: {
    width: "39%",
    height: 10,
    marginTop: 9,
    backgroundColor: "rgba(255,255,255,0.32)",
  },
  profileHero: {
    minHeight: 96,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  heroAvatarWrap: {
    position: "relative",
    padding: 3,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.96)",
    shadowColor: "#172033",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.35,
  },
  heroTitle: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    color: "rgba(255,255,255,0.94)",
    letterSpacing: -0.1,
  },
  heroMetaRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroMetaItem: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  heroMetaDot: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
  },
  heroUsername: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.82)",
  },
  heroVerified: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.3)",
  },
  heroVerifiedText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#FFFFFF",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  unavailableText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "center",
  },
  retryButton: {
    minWidth: 112,
    minHeight: 42,
    marginTop: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: BRAND,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  profileSheet: {
    flex: 1,
    minHeight: 0,
    marginTop: -48,
    zIndex: 2,
    elevation: 2,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },
  profileScroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
  },
  overviewContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  skeletonContent: {
    paddingTop: 18,
  },
  skeletonBlock: {
    backgroundColor: "#E9EDF4",
  },
  skeletonActions: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
  },
  skeletonAction: {
    width: 72,
    alignItems: "center",
  },
  skeletonActionCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  skeletonActionLabel: {
    width: 52,
    height: 8,
    marginTop: 8,
    borderRadius: 4,
  },
  skeletonSectionLabel: {
    width: 54,
    height: 9,
    marginTop: 13,
    marginBottom: 8,
    marginLeft: 2,
    borderRadius: 5,
  },
  skeletonCard: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: "#FFFFFF",
  },
  skeletonInfoRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  skeletonInfoIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
  },
  skeletonInfoCopy: {
    flex: 1,
    gap: 6,
  },
  skeletonInfoPrimary: {
    width: "67%",
    height: 10,
    borderRadius: 5,
  },
  skeletonInfoSecondary: {
    width: "43%",
    height: 8,
    borderRadius: 4,
  },
  skeletonAboutLine: {
    width: "100%",
    height: 9,
    marginVertical: 5,
    borderRadius: 5,
  },
  quickActions: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
  },
  quickAction: {
    width: 72,
    alignItems: "center",
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E6E9F1",
    backgroundColor: "#FFFFFF",
    shadowColor: "#172033",
    shadowOpacity: 0.035,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
  },
  quickActionIconConnected: {
    borderColor: "#CFF4E3",
    backgroundColor: "#ECFDF5",
  },
  quickActionIconEmphasized: {
    borderColor: "#D7DFFF",
    backgroundColor: "#EEF2FF",
  },
  quickActionLabel: {
    marginTop: 6,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "600",
    textAlign: "center",
    color: "#536175",
  },
  quickActionLabelConnected: { color: "#168A55" },
  quickActionLabelEmphasized: { color: BRAND, fontWeight: "700" },
  connectionActionWrap: { marginTop: 4 },
  relationshipCard: {
    padding: 14,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: "#FFFFFF",
  },
  relationshipCopy: { marginBottom: 10 },
  relationshipTitle: { fontSize: 13, fontWeight: "700", color: "#253047" },
  relationshipDescription: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#8794A8",
  },
  infoCard: {
    paddingHorizontal: 11,
    paddingVertical: 2,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: "#FFFFFF",
  },
  infoRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  infoIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F4FF",
  },
  infoCopy: { flex: 1, minWidth: 0 },
  infoPrimary: {
    flexShrink: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
    color: "#334155",
  },
  infoSecondary: {
    marginTop: 2,
    fontSize: 9.5,
    lineHeight: 13,
    color: "#8794A8",
  },
  infoBio: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: "#475569",
  },
  infoBioEmpty: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: "#98A2B3",
  },
  infoLink: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
    color: BRAND,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryAction: { backgroundColor: BRAND },
  secondaryAction: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E1F4",
  },
  actionLabel: { fontSize: 14, fontWeight: "700" },
  pairedActions: { flexDirection: "row", gap: 10 },
  blockedState: {
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  blockedText: { fontSize: 14, fontWeight: "700", color: "#DC2626" },
  highlightsCard: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
  },
  highlightItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  highlightValue: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "800",
    color: "#253047",
  },
  highlightLabel: {
    marginTop: 1,
    fontSize: 8,
    lineHeight: 10,
    color: "#8794A8",
  },
  section: { marginTop: 12 },
  sectionTitle: {
    marginBottom: 5,
    paddingHorizontal: 2,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
    color: "#39465C",
    letterSpacing: -0.05,
  },
  card: {
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    padding: 15,
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  emptyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F5F9",
  },
  emptyCopy: { flex: 1, fontSize: 12, lineHeight: 18, color: "#94A3B8" },
  confirmationBackdrop: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16,24,40,0.48)",
  },
  confirmationCard: {
    width: "100%",
    maxWidth: 360,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#1E1B4B",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  confirmationIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmationEyebrow: {
    marginTop: 16,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#6D4AFF",
  },
  confirmationTitle: {
    marginTop: 4,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
    color: "#172033",
  },
  confirmationBody: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 19,
    color: "#667085",
  },
  confirmationActions: { marginTop: 20, flexDirection: "row", gap: 9 },
  confirmationSecondary: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E0E5EF",
    backgroundColor: "#FFFFFF",
  },
  confirmationSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#53627A",
  },
  confirmationPrimary: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    backgroundColor: "#5B42F3",
    shadowColor: "#5B42F3",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  confirmationPrimaryText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
  },
  roleSwitcher: { gap: 8 },
  roleSwitcherLabel: {
    paddingHorizontal: 2,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: -0.05,
    color: "#39465C",
  },
  roleTrack: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 13,
    backgroundColor: "#F1F3F9",
  },
  roleSegment: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
  },
  roleSegmentSelected: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.09,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  roleSegmentLabel: {
    flexShrink: 1,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
    color: "#7B8798",
  },
  roleSegmentLabelSelected: { fontWeight: "700", color: "#1C2436" },
  roleBlurb: {
    paddingHorizontal: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#7A869A",
  },
  membershipRemoveRow: {
    marginTop: 14,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
  },
  membershipRemoveRowText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    color: "#DC2626",
  },
  membershipConfirmActions: { flexDirection: "row", gap: 9 },
  membershipKeepButton: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DEE4EC",
    backgroundColor: "#FFFFFF",
  },
  membershipKeepButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  membershipRemoveButton: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC2626",
  },
  membershipRemoveButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  membershipWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  membershipWarningIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
  },
  membershipWarningText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
    color: "#7F1D1D",
  },
  membershipConfirmButton: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND,
  },
  membershipConfirmButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  roleConfirmIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  roleConfirmText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
    color: "#41506B",
  },
  menuGroupLabel: {
    marginTop: 2,
    paddingHorizontal: 4,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: "#8B96A8",
  },
  menuCard: { paddingHorizontal: 5, paddingVertical: 5, gap: 0 },
  menuRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderRadius: 11,
  },
  menuRowPressed: { backgroundColor: "#FFFFFF" },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EBEFFE",
  },
  menuIconDestructive: { backgroundColor: "#FEEEEE" },
  menuCopy: { flex: 1, minWidth: 0 },
  menuLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#172033",
  },
  menuLabelDanger: { color: "#DC2626" },
  menuDetail: {
    marginTop: 1,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#7F8B9C",
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 49,
    backgroundColor: "#E5E9F0",
  },
});
