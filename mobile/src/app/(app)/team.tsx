import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { UserPlus } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "burnt";
import { AddMemberModal } from "@/components/AddMemberModal";
import { AlenioHeaderBrand } from "@/components/AlenioHeaderBrand";
import { CurvedTabLayout } from "@/components/CurvedTabLayout";
import { useAdaptiveLayout } from "@/lib/adaptive-layout";
import {
  AddConnectionSheet,
  type AddConnectionEntryMode,
} from "@/components/people/AddConnectionSheet";
import { ZeroWorkspaceTeamHome } from "@/components/people/ZeroWorkspaceTeamHome";
import {
  ConnectionFilterSheet,
  EMPTY_CONNECTION_FILTERS,
} from "@/components/people/ConnectionFilterSheet";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { useSession } from "@/lib/auth/use-session";
import { createForegroundIntervalController } from "@/lib/foreground-interval";
import { isLeaderRole, memberMatchesUserId } from "@/lib/member-identity";
import { teamInviteErrorMessage } from "@/lib/team-invite-errors";
import { inviteMemberByEmail } from "@/lib/team-invites-api";
import type { WorkspaceInviteRole } from "@/lib/workspace-members";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { reconcileActiveTeamAfterRemoval } from "@/lib/workspace-switch";
import type { ConnectionDirectoryFilters } from "@/lib/connection-directory";
export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const setActiveTeamId = useTeamStore((state) => state.setActiveTeamId);
  const hasHydrated = useTeamStore((state) => state._hasHydrated);
  const { access } = useWorkspaceAccess(activeTeamId);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const routeParams = useLocalSearchParams<{
    openInvite?: string;
    tab?: string;
    findPeople?: string;
  }>();
  const initialNetworkTab =
    routeParams.tab === "connections"
      ? "connections"
      : routeParams.tab === "feed" || routeParams.tab === "updates"
        ? "feed"
        : undefined;

  const [addConnectionOpen, setAddConnectionOpen] = useState(false);
  const [connectionSearch, setConnectionSearch] = useState("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [connectionFilters, setConnectionFilters] =
    useState<ConnectionDirectoryFilters>(EMPTY_CONNECTION_FILTERS);
  const [addConnectionEntryMode, setAddConnectionEntryMode] =
    useState<AddConnectionEntryMode>("all");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  // Keep the active workspace loaded only for contextual invite permissions and copy.
  // Its loading or error state never changes the People page structure.
  const { data: team } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: Boolean(activeTeamId),
    staleTime: 0,
  });

  // Prefer /api/me because it uses the same backend identity as workspace membership.
  const { data: meProfile } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () =>
      api.get<{ id: string; name: string; email: string; image: string | null }>(
        "/api/me",
      ),
    enabled: Boolean(session?.user),
    staleTime: 60_000,
  });

  useFocusEffect(
    useCallback(() => {
      if (!session?.user || !activeTeamId) return;
      void reconcileActiveTeamAfterRemoval(
        activeTeamId,
        setActiveTeamId,
        queryClient,
      ).catch(() => {
        // Cancelled query races are handled inside reconcile; keep focus quiet.
      });
    }, [activeTeamId, queryClient, session?.user, setActiveTeamId]),
  );

  // Presence is carried by the connections payload. Refresh it only while this
  // screen is focused and the app is in the foreground.
  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return;

      const connectionPolling = createForegroundIntervalController({
        intervalMs: 60_000,
        task: () =>
          queryClient.invalidateQueries({
            queryKey: ["connections"],
            refetchType: "active",
          }),
      });
      connectionPolling.setEnabled(AppState.currentState === "active");
      const subscription = AppState.addEventListener("change", (state) => {
        connectionPolling.setEnabled(state === "active");
      });

      return () => {
        subscription.remove();
        connectionPolling.stop();
      };
    }, [queryClient, session?.user?.id]),
  );

  const currentMembership = useMemo(() => {
    const sessionUserId =
      typeof session?.user?.id === "string" ? session.user.id : "";
    const sessionEmail =
      typeof session?.user?.email === "string" ? session.user.email : "";
    const resolvedUserId = meProfile?.id ?? sessionUserId;
    const resolvedEmail = meProfile?.email ?? sessionEmail;

    return (
      team?.members?.find(
        (member) =>
          Boolean(resolvedUserId) &&
          (member.userId === resolvedUserId || member.user.id === resolvedUserId),
      ) ??
      team?.members?.find((member) =>
        memberMatchesUserId(member, "", resolvedEmail),
      ) ??
      null
    );
  }, [
    meProfile?.email,
    meProfile?.id,
    session?.user?.email,
    session?.user?.id,
    team?.members,
  ]);

  const myRole =
    (team as (Team & { role?: string }) | undefined)?.role ??
    currentMembership?.role;
  const canInviteWorkspaceMembers = Boolean(
    activeTeamId && team && isLeaderRole(myRole) && access.canWrite,
  );

  const openConnectionSearch = (mode: AddConnectionEntryMode = "all") => {
    setAddConnectionEntryMode(mode);
    setAddConnectionOpen(true);
  };

  const openWorkspaceInvite = useCallback(() => {
    if (!canInviteWorkspaceMembers) return;
    setAddMemberError(null);
    setAddMemberOpen(true);
  }, [canInviteWorkspaceMembers]);

  useFocusEffect(
    useCallback(() => {
      if (routeParams.openInvite !== "1" || !canInviteWorkspaceMembers) return;
      openWorkspaceInvite();
      router.setParams({ openInvite: undefined });
    }, [
      canInviteWorkspaceMembers,
      openWorkspaceInvite,
      routeParams.openInvite,
    ]),
  );

  useFocusEffect(
    useCallback(() => {
      if (routeParams.findPeople !== "1") return;
      openConnectionSearch("all");
      router.setParams({ findPeople: undefined });
    }, [routeParams.findPeople]),
  );

  const inviteMemberMutation = useMutation({
    mutationFn: ({ emails, role }: { emails: string[]; role: WorkspaceInviteRole }) =>
      Promise.all(
        emails.map((email) => inviteMemberByEmail(activeTeamId!, email, role)),
      ),
    onSuccess: (results) => {
      setAddMemberError(null);
      setAddMemberOpen(false);
      void queryClient.invalidateQueries({
        queryKey: ["team-invites", activeTeamId],
      });
      void queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      void queryClient.invalidateQueries({ queryKey: ["member-stats", activeTeamId] });
      void queryClient.invalidateQueries({ queryKey: ["team-stars", activeTeamId] });
      if (results.length > 1) {
        toast({ title: `${results.length} members invited`, preset: "done" });
      } else if (results[0]?.added && results[0].user) {
        toast({ title: `${results[0].user.name} added to the team`, preset: "done" });
      } else if (results[0]?.emailSent) {
        toast({ title: "Invite email sent", preset: "done" });
      } else {
        toast({
          title: "Invite created (email not sent — check server email config)",
          preset: "none",
        });
      }
    },
    onError: (error: Error) => {
      setAddMemberError(teamInviteErrorMessage(error));
    },
  });

  const addPersonOverlays = (
    <>
      <AddConnectionSheet
        visible={addConnectionOpen}
        entryMode={addConnectionEntryMode}
        hasWorkspaces={Boolean(activeTeamId)}
        onClose={() => setAddConnectionOpen(false)}
      />
      <AddMemberModal
        visible={addMemberOpen}
        teamId={activeTeamId ?? ""}
        teamName={team?.name ?? "Workspace"}
        confirming={inviteMemberMutation.isPending}
        error={addMemberError}
        onClose={() => {
          setAddMemberError(null);
          setAddMemberOpen(false);
        }}
        onClearError={() => setAddMemberError(null)}
        onConfirmMany={(emails, role) =>
          inviteMemberMutation.mutate({ emails, role })
        }
      />
      <ConnectionFilterSheet
        visible={filterSheetOpen}
        value={connectionFilters}
        onClose={() => setFilterSheetOpen(false)}
        onApply={(filters) => {
          setConnectionFilters(filters);
          setFilterSheetOpen(false);
        }}
      />
    </>
  );

  const activeFilterCount = Object.values(connectionFilters).filter(Boolean).length;

  if (!hasHydrated) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "transparent",
        }}
        testID="team-hydrating"
      >
        <ActivityIndicator color="#6d28d9" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <CurvedTabLayout
      topInset={insets.top}
      title="My Network"
      hideHeaderTitle
      leftAction={<AlenioHeaderBrand title="My Network" />}
      band
      sheetColor="#FFFFFF"
      showNotifications
      rightAction={
        <Pressable
          onPress={() => openConnectionSearch("all")}
          style={{
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Add a connection"
          testID="connections-add-button"
        >
          <UserPlus size={21} color="#FFFFFF" strokeWidth={2.1} />
        </Pressable>
      }
      testID="team-screen"
      headerTestID="team-header"
      overlays={addPersonOverlays}
    >
      <View style={{ flex: 1, minHeight: 0 }} key={`network-${adaptive.width}`}>
        <ZeroWorkspaceTeamHome
          initialTab={initialNetworkTab}
          onAddConnection={openConnectionSearch}
          searchQuery={connectionSearch}
          onSearchChange={setConnectionSearch}
          onOpenFilters={() => setFilterSheetOpen(true)}
          activeFilterCount={activeFilterCount}
          filters={connectionFilters}
        />
      </View>
    </CurvedTabLayout>
  );
}
