import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import {
  Check,
  ChevronRight,
  Search,
  UsersRound,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import type {
  ConnectionRequestResponse,
  ConnectionSuggestion,
  ConnectionSuggestionDismissalResponse,
  ConnectionsResponse,
  PersonSearchResult,
} from "@/lib/types";
import { resolveUserImageUrl } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { DismissSuggestionConfirmationSheet } from "@/components/DismissSuggestionConfirmationSheet";
import { connectionRequestErrorMessage } from "@/lib/connection-request-error";
import { connectionRequestOutcome } from "@/lib/connection-request-outcome";
import {
  connectionStatusAfterAction,
  resolveNewDmRowAction,
  type NewDmRowAction,
} from "@/lib/new-dm-discovery";

export default function NewDMScreen() {
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const currentUserId = authReady?.me?.id ?? session?.user?.id ?? "";
  const [searchQuery, setSearchQuery] = useState("");
  const [rowActionOverrides, setRowActionOverrides] = useState<
    Record<string, NewDmRowAction>
  >({});
  const [suggestionToDismiss, setSuggestionToDismiss] = useState<{
    id: string;
    name: string | null;
    image: string | null;
  } | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const {
    data: workspacePeople = [],
    isError: teamError,
    error: teamLoadError,
    refetch: refetchTeam,
    isLoading: teamLoading,
  } = useQuery({
    queryKey: ["user-search", "workspaces", activeTeamId],
    queryFn: () =>
      api.get<PersonSearchResult[]>(
        `/api/users/search?scope=workspaces&teamId=${encodeURIComponent(activeTeamId ?? "")}`,
      ),
    enabled: !!activeTeamId,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { data: connections } = useQuery({
    queryKey: ["connections", currentUserId],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
    enabled: currentUserId.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const {
    data: suggestions = [],
    isLoading: suggestionsLoading,
    isError: suggestionsError,
    refetch: refetchSuggestions,
  } = useQuery({
    queryKey: ["connection-suggestions", "new-dm"],
    queryFn: () =>
      api.get<ConnectionSuggestion[]>("/api/connections/suggestions?limit=12"),
    enabled: searchQuery.trim().length === 0,
    staleTime: 60_000,
  });

  useFocusEffect(
    useCallback(() => {
      if (!activeTeamId) return;
      void queryClient.invalidateQueries({
        queryKey: ["user-search", "workspaces", activeTeamId],
      });
    }, [activeTeamId, queryClient]),
  );

  const {
    data: searchResults = [],
    isFetching: isSearching,
    isError: searchError,
    error: searchLoadError,
    refetch: refetchSearch,
  } = useQuery({
    queryKey: ["user-search", searchQuery],
    queryFn: () =>
      api.get<PersonSearchResult[]>(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}`,
      ),
    enabled: searchQuery.trim().length >= 2,
  });

  const dmMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api.post<{
        id: string;
        recipient: { name: string; image?: string | null } | null;
      }>("/api/dms/find-or-create", { recipientId }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      router.replace({
        pathname: "/dm-chat",
        params: {
          conversationId: conv.id,
          recipientName: conv.recipient?.name ?? "Direct Message",
          recipientImage: resolveUserImageUrl(conv.recipient?.image) ?? "",
          isGroup: "false",
        },
      });
    },
    onError: (err) => {
      toast({
        title:
          err instanceof Error ? err.message : "Couldn't start conversation",
        preset: "error",
      });
    },
  });

  const connectionMutation = useMutation({
    mutationFn: async ({
      userId,
      action,
    }: {
      userId: string;
      action: "request" | "accept";
    }) => {
      const response = await api.post<ConnectionRequestResponse>(
        `/api/connections/${action}`,
        { userId },
      );
      return { response, action };
    },
    onSuccess: ({ response, action }, variables) => {
      const next = connectionStatusAfterAction(action, response.status);
      setRowActionOverrides((current) => ({
        ...current,
        [variables.userId]: next.canMessage ? "message" : "requested",
      }));
      queryClient.setQueriesData<PersonSearchResult[]>(
        { queryKey: ["user-search"] },
        (current) =>
          current?.map((person) =>
            person.id === variables.userId ? { ...person, ...next } : person,
          ),
      );
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({
        queryKey: ["connection-suggestions"],
      });
      void queryClient.invalidateQueries({ queryKey: ["user-search"] });
      toast({
        title:
          action === "accept"
            ? "Connection accepted"
            : connectionRequestOutcome(response).toastTitle,
        preset: "done",
      });
    },
    onError: (error: unknown) =>
      toast({
        title: connectionRequestErrorMessage(error),
        preset: "error",
      }),
  });

  const dismissSuggestionMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<ConnectionSuggestionDismissalResponse>(
        "/api/connections/suggestions/dismiss",
        { userId },
      ),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: ["connection-suggestions"] });
      const previous = queryClient.getQueriesData<ConnectionSuggestion[]>({
        queryKey: ["connection-suggestions"],
      });
      queryClient.setQueriesData<ConnectionSuggestion[]>(
        { queryKey: ["connection-suggestions"] },
        (current) =>
          current?.filter((suggestion) => suggestion.person.id !== userId),
      );
      return { previous };
    },
    onError: (_error, _userId, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
      toast({ title: "Couldn’t dismiss suggestion", preset: "error" });
    },
    onSuccess: () => setSuggestionToDismiss(null),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["connection-suggestions"],
      });
    },
  });

  /** One row shape for both the roster fallback and global search results. */
  type PersonRow = {
    id: string;
    name: string | null;
    image: string | null;
    subtitle: string | null;
    reason?: string | null;
    action: NewDmRowAction;
    section?: "Team Members" | "Connections" | "Suggested";
  };

  const teamMembers: PersonRow[] = useMemo(
    () =>
      workspacePeople
        .filter((person) => person.id !== currentUserId)
        .map((person) => ({
          id: person.id,
          name: person.name,
          image: person.image,
          subtitle: person.username
            ? `@${person.username}`
            : person.sharedWorkspaceName,
          action: resolveNewDmRowAction(person),
          section: "Team Members" as const,
        })),
    [workspacePeople, currentUserId],
  );

  const searchRows: PersonRow[] = useMemo(
    () =>
      searchResults
        .filter((u) => u.id !== currentUserId)
        .map((u) => ({
          id: u.id,
          name: u.name,
          image: u.image,
          // Handle first, workspace as the fallback hint. Never an email address.
          subtitle: u.username ? `@${u.username}` : u.sharedWorkspaceName,
          action: resolveNewDmRowAction(u),
        })),
    [searchResults, currentUserId],
  );
  const globalConnectionRows: PersonRow[] = useMemo(
    () =>
      (connections?.accepted ?? [])
        .map((entry) => ({
          id: entry.person.id,
          name: entry.person.name,
          image: entry.person.image,
          subtitle: entry.person.username
            ? `@${entry.person.username}`
            : "Connection",
          action: "message" as const,
          section: "Connections" as const,
        }))
        .sort((a, b) => {
          const aName = a.name?.trim();
          const bName = b.name?.trim();
          if (!aName && !bName) return a.id.localeCompare(b.id);
          if (!aName) return 1;
          if (!bName) return -1;
          return aName.localeCompare(bName, undefined, { sensitivity: "base" });
        })
        .slice(0, 5),
    [connections?.accepted],
  );
  const outgoingRequestIds = useMemo(
    () =>
      new Set((connections?.outgoing ?? []).map((entry) => entry.person.id)),
    [connections?.outgoing],
  );
  const suggestionRows: PersonRow[] = useMemo(
    () =>
      suggestions
        .filter(
          (suggestion) =>
            suggestion.person.id !== currentUserId &&
            (!outgoingRequestIds.has(suggestion.person.id) ||
              rowActionOverrides[suggestion.person.id] === "requested"),
        )
        .slice(0, 5)
        .map((suggestion) => ({
          id: suggestion.person.id,
          name: suggestion.person.name,
          image: suggestion.person.image,
          subtitle: suggestion.person.username
            ? `@${suggestion.person.username}`
            : (suggestion.reasons[0]?.label ?? "Suggested for you"),
          reason: suggestion.person.username
            ? (suggestion.reasons[0]?.label ?? null)
            : null,
          action: "connect" as const,
          section: "Suggested" as const,
        })),
    [currentUserId, outgoingRequestIds, rowActionOverrides, suggestions],
  );
  const discoveryRows: PersonRow[] = useMemo(() => {
    const primary = activeTeamId ? teamMembers : [];
    const seen = new Set(primary.map((person) => person.id));
    const connectionRows = globalConnectionRows.filter((person) => {
      if (seen.has(person.id)) return false;
      seen.add(person.id);
      return true;
    });
    return [
      ...primary,
      ...connectionRows,
      ...suggestionRows.filter((person) => !seen.has(person.id)),
    ];
  }, [activeTeamId, globalConnectionRows, suggestionRows, teamMembers]);

  const trimmedSearch = searchQuery.trim();
  const baseDisplayUsers =
    trimmedSearch.length >= 2
      ? searchRows
      : trimmedSearch.length === 0
        ? discoveryRows
        : [];
  const displayUsers = baseDisplayUsers.map((person) => {
    const action = rowActionOverrides[person.id];
    return action ? { ...person, action } : person;
  });

  return (
    <SafeAreaView
      testID="new-dm-screen"
      className="flex-1 bg-white dark:bg-slate-900"
      edges={["top", "bottom"]}
    >
      <View style={headerStyles.sheetHeader}>
        <Image
          source={require("@/assets/alenio-icon.png")}
          style={headerStyles.sheetHeaderLogo}
          resizeMode="contain"
        />
        <View style={headerStyles.sheetHeaderCopy}>
          <Text style={headerStyles.sheetHeaderTitle}>Find People</Text>
          <Text style={headerStyles.sheetHeaderSubtitle}>
            Search Alenio by name, username, or email.
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          style={headerStyles.sheetHeaderClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={20} color="#64748B" strokeWidth={2.25} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View className="px-4 pb-3 pt-2 border-b border-slate-100 dark:border-slate-800">
        <View
          className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-2xl px-4"
          style={headerStyles.searchField}
        >
          <Search size={16} color="#94A3B8" />
          <TextInput
            ref={searchInputRef}
            testID="dm-user-search-input"
            placeholder="Search people on Alenio"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm text-slate-900 dark:text-white"
            style={headerStyles.searchInput}
            autoFocus
          />
          {isSearching ? (
            <ActivityIndicator size="small" color="#94A3B8" />
          ) : null}
        </View>
        <Text
          style={{
            marginTop: 7,
            paddingHorizontal: 10,
            fontSize: 10,
            color: "#94A3B8",
          }}
        >
          Search by name or @username
        </Text>
      </View>

      {!searchQuery.trim() && teamError ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 40,
          }}
          testID="new-dm-team-error"
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: "#64748B",
              textAlign: "center",
            }}
          >
            Couldn&apos;t load teammates
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: "#94A3B8",
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {teamLoadError instanceof Error
              ? teamLoadError.message
              : "Please try again."}
          </Text>
          <TouchableOpacity
            onPress={() => void refetchTeam()}
            testID="new-dm-team-error-retry"
            style={{
              marginTop: 16,
              backgroundColor: "#4361EE",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!searchQuery.trim() && !teamError && teamLoading ? (
        <View
          style={{ paddingVertical: 32, alignItems: "center" }}
          testID="new-dm-team-loading"
        >
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : null}

      {searchQuery.trim().length >= 2 && searchError ? (
        <View
          style={{
            paddingHorizontal: 40,
            paddingVertical: 24,
            alignItems: "center",
          }}
          testID="new-dm-search-error"
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: "#64748B",
              textAlign: "center",
            }}
          >
            Couldn&apos;t search users
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: "#94A3B8",
              marginTop: 6,
              textAlign: "center",
            }}
          >
            {searchLoadError instanceof Error
              ? searchLoadError.message
              : "Please try again."}
          </Text>
          <TouchableOpacity
            onPress={() => void refetchSearch()}
            testID="new-dm-search-error-retry"
            style={{
              marginTop: 12,
              backgroundColor: "#4361EE",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {((!teamError && !teamLoading) || searchQuery.trim().length >= 2) &&
      !searchError ? (
        <FlatList
          testID="dm-user-list"
          data={displayUsers}
          keyExtractor={(item) => item.id}
          removeClippedSubviews={false}
          contentContainerStyle={{
            flexGrow: displayUsers.length === 0 ? 1 : undefined,
            paddingBottom: 24,
          }}
          ListFooterComponent={
            trimmedSearch.length === 0 && suggestionRows.length > 0 ? (
              <TouchableOpacity
                onPress={() => searchInputRef.current?.focus()}
                style={rowStyles.searchFooter}
                accessibilityRole="button"
                accessibilityLabel="Search for someone else on Alenio"
                testID="new-dm-search-footer"
              >
                <View style={rowStyles.searchFooterArt}>
                  <View
                    style={[
                      rowStyles.searchFooterPerson,
                      { left: 17, top: 18 },
                    ]}
                  />
                  <View
                    style={[
                      rowStyles.searchFooterPerson,
                      { right: 17, top: 18 },
                    ]}
                  />
                  <View style={[rowStyles.searchFooterPersonLarge]} />
                  <View style={rowStyles.searchFooterMagnifier}>
                    <Search size={20} color="#667BFF" strokeWidth={2.5} />
                  </View>
                </View>
                <Text style={rowStyles.searchFooterTitle}>
                  Looking for someone else?
                </Text>
                <Text style={rowStyles.searchFooterBody}>
                  Search anyone on Alenio by name or username.
                </Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            trimmedSearch.length >= 2 && !isSearching ? (
              <View style={emptyStyles.container} testID="new-dm-search-empty">
                <View style={emptyStyles.icon}>
                  <Search size={22} color="#5B45FF" strokeWidth={2} />
                </View>
                <Text style={emptyStyles.title}>No people found</Text>
                <Text style={emptyStyles.body}>
                  Check the spelling or search with a different name or
                  @username.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  style={emptyStyles.secondaryButton}
                >
                  <Text style={emptyStyles.secondaryButtonText}>
                    Clear search
                  </Text>
                </TouchableOpacity>
              </View>
            ) : trimmedSearch.length === 0 && suggestionsLoading ? (
              <View
                style={emptyStyles.container}
                testID="new-dm-suggestions-loading"
              >
                <ActivityIndicator color="#4361EE" />
                <Text style={emptyStyles.loadingText}>
                  Finding people you may know…
                </Text>
              </View>
            ) : trimmedSearch.length === 0 && suggestionsError ? (
              <View
                style={emptyStyles.container}
                testID="new-dm-suggestions-error"
              >
                <View style={emptyStyles.icon}>
                  <UsersRound size={23} color="#5B45FF" strokeWidth={2} />
                </View>
                <Text style={emptyStyles.title}>
                  Suggestions are unavailable
                </Text>
                <Text style={emptyStyles.body}>
                  You can still search Alenio by name or @username.
                </Text>
                <TouchableOpacity
                  onPress={() => void refetchSuggestions()}
                  style={emptyStyles.primaryButton}
                >
                  <Text style={emptyStyles.primaryButtonText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : trimmedSearch.length === 0 && !teamLoading ? (
              <View
                style={emptyStyles.container}
                testID="new-dm-discovery-empty"
              >
                <View style={emptyStyles.icon}>
                  <UsersRound size={23} color="#5B45FF" strokeWidth={2} />
                </View>
                <Text style={emptyStyles.title}>Find someone on Alenio</Text>
                <Text style={emptyStyles.body}>
                  Search by name or @username. Suggestions will appear as your
                  workspace and network grow.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const connectionPending =
              connectionMutation.isPending &&
              connectionMutation.variables?.userId === item.id;
            const messagePending =
              dmMutation.isPending && dmMutation.variables === item.id;
            const connectionAction =
              item.action === "accept" ? "accept" : "request";
            const actionLabel =
              item.action === "message"
                ? "Message"
                : item.action === "accept"
                  ? "Accept"
                  : item.action === "requested"
                    ? "Requested"
                    : "Connect";

            return (
              <>
                {!trimmedSearch &&
                (index === 0 ||
                  displayUsers[index - 1]?.section !== item.section) ? (
                  <Text style={rowStyles.sectionTitle}>
                    {item.section === "Suggested"
                      ? "People you may know"
                      : item.section}
                  </Text>
                ) : null}
                <View
                  testID={`dm-user-item-${item.id}`}
                  style={[
                    rowStyles.card,
                    item.section === "Suggested"
                      ? rowStyles.suggestedCard
                      : null,
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => {
                      if (item.action === "message") {
                        dmMutation.mutate(item.id);
                        return;
                      }
                      if (item.section === "Suggested") {
                        router.push({
                          pathname: "/person",
                          params: { userId: item.id },
                        });
                      }
                    }}
                    disabled={
                      dmMutation.isPending ||
                      (item.action !== "message" &&
                        item.section !== "Suggested")
                    }
                    className="flex-1 flex-row items-center"
                    accessibilityRole="button"
                    accessibilityLabel={
                      item.section === "Suggested"
                        ? `View ${item.name ?? "person"}'s profile`
                        : undefined
                    }
                  >
                    <View style={{ marginRight: 16 }}>
                      <UserAvatar
                        user={item}
                        size={40}
                        radius={20}
                        backgroundColor="#6366F1"
                        textColor="#FFFFFF"
                        fontSize={14}
                        resetKey={item.id}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-slate-900 dark:text-white">
                        {item.name}
                      </Text>
                      {item.subtitle ? (
                        <Text
                          className="text-xs text-slate-500"
                          numberOfLines={1}
                        >
                          {item.subtitle}
                        </Text>
                      ) : null}
                      {item.reason ? (
                        <Text style={rowStyles.reason} numberOfLines={1}>
                          {item.reason}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>

                  {item.section === "Suggested" && item.action === "connect" ? (
                    <TouchableOpacity
                      onPress={(event) => {
                        event.stopPropagation();
                        setSuggestionToDismiss({
                          id: item.id,
                          name: item.name,
                          image: item.image,
                        });
                      }}
                      disabled={
                        dismissSuggestionMutation.isPending &&
                        dismissSuggestionMutation.variables === item.id
                      }
                      hitSlop={7}
                      style={rowStyles.dismissSuggestion}
                      accessibilityRole="button"
                      accessibilityLabel={`Dismiss suggestion for ${item.name ?? "person"}`}
                      testID={`dm-suggestion-dismiss-${item.id}`}
                    >
                      <X size={14} color="#94A3B8" strokeWidth={2.2} />
                    </TouchableOpacity>
                  ) : null}

                  {messagePending || connectionPending ? (
                    <View style={{ width: 72, alignItems: "center" }}>
                      <ActivityIndicator size="small" color="#4361EE" />
                    </View>
                  ) : item.action === "requested" ? (
                    <View
                      style={rowStyles.requestSentButton}
                      accessibilityRole="text"
                      accessibilityLabel={`Connection request sent to ${item.name ?? "person"}`}
                      testID={`dm-user-request-sent-${item.id}`}
                    >
                      <Check size={13} color="#4361EE" strokeWidth={2.6} />
                      <Text style={rowStyles.requestSentText}>
                        Request sent
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={(event) => {
                        event.stopPropagation();
                        return item.action === "message"
                          ? dmMutation.mutate(item.id)
                          : connectionMutation.mutate({
                              userId: item.id,
                              action: connectionAction,
                            });
                      }}
                      disabled={
                        dmMutation.isPending || connectionMutation.isPending
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${actionLabel} ${item.name ?? "person"}`}
                      testID={`dm-user-action-${item.id}`}
                      style={{
                        minWidth: 72,
                        minHeight: 34,
                        paddingHorizontal: 12,
                        borderRadius: 17,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 2,
                        backgroundColor:
                          item.action === "message" ? "#EEF2FF" : "#4361EE",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color:
                            item.action === "message" ? "#4361EE" : "#FFFFFF",
                        }}
                      >
                        {actionLabel}
                      </Text>
                      <ChevronRight
                        size={13}
                        color={
                          item.action === "message" ? "#4361EE" : "#FFFFFF"
                        }
                        strokeWidth={2.4}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            );
          }}
        />
      ) : null}
      <DismissSuggestionConfirmationSheet
        person={suggestionToDismiss}
        pending={dismissSuggestionMutation.isPending}
        onClose={() => setSuggestionToDismiss(null)}
        onConfirm={() => {
          if (suggestionToDismiss) {
            dismissSuggestionMutation.mutate(suggestionToDismiss.id);
          }
        }}
      />
    </SafeAreaView>
  );
}

const headerStyles = StyleSheet.create({
  sheetHeader: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sheetHeaderLogo: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  sheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  sheetHeaderTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  sheetHeaderSubtitle: {
    marginTop: 1,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#8290A6",
  },
  sheetHeaderClose: {
    width: 28,
    height: 28,
    marginLeft: 4,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  searchField: {
    minHeight: 40,
    gap: 8,
  },
  searchInput: {
    height: 40,
    paddingVertical: 0,
    fontSize: 14,
    lineHeight: 18,
  },
});

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingBottom: 40,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#F0EEFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: "#172033",
    textAlign: "center",
  },
  body: {
    maxWidth: 290,
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: "#7B8799",
    textAlign: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 12,
    color: "#7B8799",
  },
  primaryButton: {
    minHeight: 38,
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#4361EE",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  primaryButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryButton: {
    minHeight: 38,
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D9DDE7",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#536075",
  },
});

const rowStyles = StyleSheet.create({
  sectionTitle: {
    marginTop: 15,
    marginBottom: 8,
    paddingHorizontal: 16,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#344054",
  },
  card: {
    minHeight: 68,
    marginHorizontal: 16,
    marginBottom: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEF1F5",
    backgroundColor: "#FFFFFF",
  },
  suggestedCard: {
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 7,
    elevation: 1,
  },
  dismissSuggestion: {
    width: 30,
    height: 30,
    marginLeft: 4,
    marginRight: 4,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  reason: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    color: "#98A2B3",
  },
  requestSentButton: {
    minWidth: 104,
    minHeight: 34,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DCE3FF",
    backgroundColor: "#EEF2FF",
  },
  requestSentText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#4361EE",
  },
  searchFooter: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 18,
    paddingHorizontal: 24,
  },
  searchFooterArt: {
    width: 112,
    height: 72,
    position: "relative",
    marginBottom: 8,
  },
  searchFooterPerson: {
    position: "absolute",
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: "#E8ECFF",
  },
  searchFooterPersonLarge: {
    position: "absolute",
    left: 34,
    top: 5,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D9E0FF",
  },
  searchFooterMagnifier: {
    position: "absolute",
    right: 2,
    bottom: 1,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F2F4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  searchFooterTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#172033",
    textAlign: "center",
  },
  searchFooterBody: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 15,
    color: "#8390A3",
    textAlign: "center",
  },
});
