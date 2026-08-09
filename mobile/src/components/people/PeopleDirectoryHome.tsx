import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Check, ChevronRight, UserPlus } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import type {
  ConnectionSuggestion,
  ConnectionsResponse,
  Team,
  TeamMember,
} from "@/lib/types";
import {
  buildPeopleDirectory,
  filterDirectoryPeople,
  selectDirectoryBadges,
  suggestionExplanation,
  type DirectoryPerson,
  type PeopleDirectoryFilter,
} from "@/lib/people-directory";
import type { MemberStatsRow } from "@/lib/workplace-standards";
import { UserAvatar } from "@/components/UserAvatar";
import {
  CurrentWorkspaceBadge,
  WorkspaceTeamAvatar,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import { SwitchWorkspaceSheet } from "@/components/SwitchWorkspaceSheet";
import { colors } from "@/theme";

type Props = {
  team: Team;
  members: TeamMember[];
  myId: string;
  isLeader: boolean;
  memberStats?: Record<string, MemberStatsRow>;
  contentBottomPad: number;
  refreshing: boolean;
  onRefresh: () => void;
  onInvite: () => void;
  onAddConnection: () => void;
  canViewMemberProfile: (targetUserId: string, targetRole: string) => boolean;
  searchQuery: string;
};

const FILTERS: { key: PeopleDirectoryFilter; label: string }[] = [
  { key: "everyone", label: "Everyone" },
  { key: "team", label: "Team" },
  { key: "connections", label: "Connections" },
  { key: "suggested", label: "Suggested" },
];

function PersonRow({
  person,
  connecting,
  onOpen,
  onConnect,
}: {
  person: DirectoryPerson;
  connecting: boolean;
  onOpen: () => void;
  onConnect: () => void;
}) {
  const badges = selectDirectoryBadges(person);
  return (
    <View style={styles.personRow} testID={`people-person-${person.id}`}>
      <Pressable onPress={onOpen} style={styles.personMain}>
        <UserAvatar
          user={person}
          size={44}
          radius={22}
          backgroundColor="#EEF2FF"
          textColor={colors.brand}
          fontSize={15}
        />
        <View style={styles.personCopy}>
          <Text style={styles.personName} numberOfLines={1}>{person.name}</Text>
          {person.suggestion ? (
            <Text style={styles.reasonText} numberOfLines={2}>
              {suggestionExplanation(person.suggestion)}
            </Text>
          ) : person.username ? (
            <Text style={styles.reasonText} numberOfLines={1}>@{person.username}</Text>
          ) : null}
          {badges.length > 0 ? (
            <View style={styles.badgeRow}>
              {badges.map((badge) => (
                <View
                  key={`${badge.key}-${badge.label}`}
                  style={[
                    styles.badge,
                    badge.key === "connected" ? styles.connectedBadge : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      badge.key === "connected" ? styles.connectedBadgeText : null,
                    ]}
                    numberOfLines={1}
                  >
                    {badge.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
      {person.suggestion && !person.connection ? (
        <Pressable
          onPress={onConnect}
          disabled={connecting}
          style={styles.connectButton}
          accessibilityRole="button"
          accessibilityLabel={`Connect with ${person.name}`}
          testID={`people-connect-${person.id}`}
        >
          {connecting ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <>
              <UserPlus size={13} color={colors.brand} />
              <Text style={styles.connectText}>Connect</Text>
            </>
          )}
        </Pressable>
      ) : (
        <ChevronRight size={16} color="#B3BCC9" />
      )}
    </View>
  );
}

export function PeopleDirectoryHome({
  team,
  members,
  myId,
  contentBottomPad,
  refreshing,
  onRefresh,
  onInvite,
  onAddConnection,
  canViewMemberProfile,
  searchQuery,
}: Props) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<PeopleDirectoryFilter>("everyone");
  const [switchOpen, setSwitchOpen] = useState(false);
  const suggestionsKey = ["connection-suggestions", team.id] as const;

  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
  });
  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: suggestionsKey,
    queryFn: () =>
      api.get<ConnectionSuggestion[]>(
        `/api/connections/suggestions?teamId=${encodeURIComponent(team.id)}&limit=30`,
      ),
  });

  const connectionMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post("/api/connections/request", { userId }),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: suggestionsKey });
      const previous =
        queryClient.getQueryData<ConnectionSuggestion[]>(suggestionsKey);
      queryClient.setQueryData<ConnectionSuggestion[]>(
        suggestionsKey,
        (current = []) =>
          current.filter((item) => item.person.id !== userId),
      );
      return { previous };
    },
    onError: (error: Error, _userId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(suggestionsKey, context.previous);
      }
      toast({ title: error.message || "Could not send request", preset: "error" });
    },
    onSuccess: () =>
      toast({ title: "Connection request sent", preset: "done" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({ queryKey: ["connection-suggestions"] });
      void queryClient.invalidateQueries({ queryKey: ["user-search"] });
    },
  });

  const people = useMemo(
    () =>
      buildPeopleDirectory({
        members,
        connections: connections?.accepted ?? [],
        suggestions,
        excludeUserId: myId,
      }),
    [connections?.accepted, members, myId, suggestions],
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visiblePeople = useMemo(
    () =>
      filterDirectoryPeople(people, filter).filter(
        (person) =>
          !normalizedQuery ||
          person.name.toLowerCase().includes(normalizedQuery) ||
          person.username?.toLowerCase().includes(normalizedQuery),
      ),
    [filter, normalizedQuery, people],
  );

  const openPerson = (person: DirectoryPerson) => {
    if (person.member && canViewMemberProfile(person.id, person.member.role)) {
      router.push({
        pathname: "/member-profile",
        params: { teamId: team.id, memberUserId: person.id },
      });
      return;
    }
    router.push({ pathname: "/person", params: { userId: person.id } });
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        testID="people-directory-home"
      >
        <Text style={styles.sectionHeader}>WORKSPACE</Text>
        <Pressable
          onPress={() => setSwitchOpen(true)}
          style={styles.workspaceCard}
          testID="people-current-workspace"
        >
          <WorkspaceTeamAvatar team={team} size={48} radius={12} active />
          <View style={styles.workspaceCopy}>
            <View style={styles.workspaceNameRow}>
              <Text style={styles.workspaceName} numberOfLines={1}>{team.name}</Text>
              <CurrentWorkspaceBadge compact />
            </View>
            <Text style={styles.workspaceMeta}>
              {formatTeamRole(team.role)} · {members.length} member{members.length === 1 ? "" : "s"}
            </Text>
          </View>
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              onInvite();
            }}
            style={styles.inviteButton}
            testID="people-workspace-invite"
          >
            <UserPlus size={13} color={colors.brand} />
            <Text style={styles.inviteText}>Invite</Text>
          </Pressable>
        </Pressable>

        <View style={styles.peopleHeader}>
          <Text style={styles.sectionHeader}>PEOPLE</Text>
          <Pressable onPress={onAddConnection} testID="people-browse-people">
            <Text style={styles.browseText}>Browse people</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={[styles.filterChip, active ? styles.filterChipActive : null]}
                testID={`people-filter-${item.key}`}
              >
                {active ? <Check size={12} color="#FFFFFF" /> : null}
                <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filter === "suggested" && suggestionsLoading ? (
          <ActivityIndicator color={colors.brand} style={styles.loading} />
        ) : visiblePeople.length > 0 ? (
          <View style={styles.peopleCard}>
            {visiblePeople.map((person, index) => (
              <View key={person.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <PersonRow
                  person={person}
                  connecting={Boolean(
                    connectionMutation.isPending &&
                      connectionMutation.variables === person.id,
                  )}
                  onOpen={() => openPerson(person)}
                  onConnect={() => connectionMutation.mutate(person.id)}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {filter === "suggested" ? "No suggestions right now" : "No people found"}
            </Text>
            <Text style={styles.emptyCopy}>
              {filter === "suggested"
                ? "Browse people to search by name or username."
                : "Try another filter or search."}
            </Text>
          </View>
        )}
      </ScrollView>
      <SwitchWorkspaceSheet visible={switchOpen} onClose={() => setSwitchOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 18 },
  sectionHeader: { fontSize: 10, fontWeight: "700", letterSpacing: 0.75, color: "#8A96A8" },
  workspaceCard: { marginTop: 10, padding: 11, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, borderColor: "#E3E8F0", backgroundColor: "#FFFFFF" },
  workspaceCopy: { flex: 1, minWidth: 0 },
  workspaceNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  workspaceName: { flexShrink: 1, fontSize: 14, fontWeight: "700", color: "#0F172A" },
  workspaceMeta: { marginTop: 4, fontSize: 10.5, color: "#7C8798" },
  inviteButton: { height: 31, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, borderWidth: 1, borderColor: "#AFC0FF" },
  inviteText: { fontSize: 10.5, fontWeight: "700", color: colors.brand },
  peopleHeader: { marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  browseText: { fontSize: 11, fontWeight: "700", color: colors.brand },
  filterScroll: { flexGrow: 0, marginHorizontal: -20, marginTop: 11, marginBottom: 13 },
  filterRow: { gap: 7, paddingHorizontal: 20 },
  filterChip: { minHeight: 31, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 16, borderWidth: 1, borderColor: "#DDE4EE", backgroundColor: "#FFFFFF" },
  filterChipActive: { borderColor: colors.brand, backgroundColor: colors.brand },
  filterText: { fontSize: 10.5, fontWeight: "600", color: "#64748B" },
  filterTextActive: { color: "#FFFFFF" },
  peopleCard: { overflow: "hidden", borderRadius: 15, borderWidth: 1, borderColor: "#E6EAF0", backgroundColor: "#FFFFFF" },
  personRow: { minHeight: 78, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  personMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  reasonText: { marginTop: 2, fontSize: 10.5, lineHeight: 14, color: "#7C8798" },
  badgeRow: { marginTop: 5, flexDirection: "row", gap: 5 },
  badge: { maxWidth: 118, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: "#EEF2FF" },
  badgeText: { fontSize: 8.5, fontWeight: "700", color: "#4F46E5" },
  connectedBadge: { backgroundColor: "#ECFDF5" },
  connectedBadgeText: { color: "#168A55" },
  connectButton: { minWidth: 76, height: 32, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 10, borderWidth: 1, borderColor: "#AFC0FF", backgroundColor: "#F8FAFF" },
  connectText: { fontSize: 10, fontWeight: "700", color: colors.brand },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 66, backgroundColor: "#E9EDF3" },
  loading: { marginTop: 30 },
  emptyState: { alignItems: "center", padding: 25, borderRadius: 15, borderWidth: 1, borderColor: "#E6EAF0", backgroundColor: "#FFFFFF" },
  emptyTitle: { fontSize: 13, fontWeight: "700", color: "#475569" },
  emptyCopy: { marginTop: 4, fontSize: 11, textAlign: "center", color: "#8A96A8" },
});
