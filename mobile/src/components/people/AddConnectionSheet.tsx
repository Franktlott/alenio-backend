import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Building2,
  Check,
  Clock,
  Globe2,
  Search,
  UserPlus,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api/api";
import { connectionRequestOutcome } from "@/lib/connection-request-outcome";
import { connectionRequestErrorMessage } from "@/lib/connection-request-error";
import type {
  ConnectionRequestResponse,
  PersonSearchResult,
} from "@/lib/types";
import { colors } from "@/theme";

export type AddConnectionEntryMode = "all" | "username" | "name";

type Props = {
  visible: boolean;
  onClose: () => void;
  entryMode?: AddConnectionEntryMode;
  hasWorkspaces?: boolean;
};

type ConnectionSearchScope = "all" | "workspaces";

const ENTRY_COPY: Record<
  AddConnectionEntryMode,
  { title: string; subtitle: string; placeholder: string; accessibilityLabel: string }
> = {
  all: {
    title: "Find People",
    subtitle: "Search Alenio by name, username, or email.",
    placeholder: "Search name, username, or email",
    accessibilityLabel: "Search Alenio people",
  },
  username: {
    title: "Search by Username",
    subtitle: "Enter the Alenio username of the person you want to find.",
    placeholder: "Enter @username",
    accessibilityLabel: "Search by Alenio username",
  },
  name: {
    title: "Search by Name",
    subtitle: "Enter someone’s full name to find them on Alenio.",
    placeholder: "Enter full name",
    accessibilityLabel: "Search Alenio people by name",
  },
};

export function AddConnectionSheet({
  visible,
  onClose,
  entryMode = "all",
  hasWorkspaces = false,
}: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ConnectionSearchScope>("all");
  const trimmed = query.trim();
  const entryCopy = ENTRY_COPY[entryMode];
  const isWorkspaceScope = hasWorkspaces && scope === "workspaces";
  const canSearch = isWorkspaceScope || trimmed.length >= 2;

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setScope("all");
      return;
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => inputRef.current?.focus()),
    );
  }, [visible, entryMode, hasWorkspaces]);

  useEffect(() => {
    setQuery("");
    setScope("all");
  }, [hasWorkspaces]);

  const {
    data: results = [],
    isFetching,
    isError,
  } = useQuery({
    queryKey: [
      "user-search",
      scope,
      hasWorkspaces,
      isWorkspaceScope,
      trimmed,
    ],
    queryFn: () => {
      const workspaceParams = isWorkspaceScope
        ? "&scope=workspaces"
        : "";
      return api.get<PersonSearchResult[]>(
        `/api/users/search?q=${encodeURIComponent(trimmed)}${workspaceParams}`,
      );
    },
    enabled: visible && canSearch,
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
      if (action === "request") {
        const outcome = connectionRequestOutcome(response);
        queryClient.setQueriesData<PersonSearchResult[]>(
          { queryKey: ["user-search"] },
          (current) =>
            current?.map((person) =>
              person.id === variables.userId
                ? { ...person, connectionStatus: outcome.status }
                : person,
            ),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({ queryKey: ["connection-suggestions"] });
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

  const openPerson = (userId: string) => {
    onClose();
    router.push({ pathname: "/person", params: { userId } });
  };

  return (
    <AlenioBottomSheet
      visible={visible}
      title={entryCopy.title}
      subtitle={entryCopy.subtitle}
      onClose={onClose}
      showCloseButton
      bodyHeightRatio={0.68}
      showScrollIndicator={results.length > 5}
      testID="add-connection-sheet"
    >
      {hasWorkspaces ? (
        <View style={styles.scopeSection}>
          <View style={styles.scopeControl}>
            <Pressable
              onPress={() => setScope("all")}
              style={[
                styles.scopeOption,
                scope === "all" ? styles.scopeOptionActive : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Search all Alenio"
              accessibilityState={{ selected: scope === "all" }}
              testID="connection-scope-all"
            >
              <Globe2
                size={14}
                color={scope === "all" ? colors.brand : "#7D899C"}
              />
              <Text
                style={[
                  styles.scopeOptionText,
                  scope === "all" ? styles.scopeOptionTextActive : null,
                ]}
              >
                All Alenio
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setScope("workspaces")}
              style={[
                styles.scopeOption,
                scope === "workspaces" ? styles.scopeOptionActive : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Browse members of my workspaces"
              accessibilityState={{ selected: scope === "workspaces" }}
              testID="connection-scope-workspace"
            >
              <Building2
                size={14}
                color={scope === "workspaces" ? colors.brand : "#7D899C"}
              />
              <Text
                style={[
                  styles.scopeOptionText,
                  scope === "workspaces" ? styles.scopeOptionTextActive : null,
                ]}
              >
                My Workspaces
              </Text>
            </Pressable>
          </View>
          <Text style={styles.scopeHelp} numberOfLines={1}>
            {isWorkspaceScope
              ? "Browsing members across all your workspaces"
              : "Search across all of Alenio"}
          </Text>
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <Search size={17} color="#8290A6" strokeWidth={2.2} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder={entryCopy.placeholder}
          placeholderTextColor="#98A3B5"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel={entryCopy.accessibilityLabel}
          testID="add-connection-search"
        />
        {trimmed.length > 0 ? (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            testID="add-connection-clear-search"
          >
            <X size={16} color="#98A3B5" />
          </Pressable>
        ) : null}
      </View>

      {!isWorkspaceScope && trimmed.length < 2 ? (
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <UserPlus size={25} color={colors.brand} strokeWidth={2} />
          </View>
          <Text style={styles.introTitle}>Grow your Alenio network</Text>
          <Text style={styles.introCopy}>
            Search for a teammate, colleague, or friend and send a connection
            request.
          </Text>
        </View>
      ) : isFetching ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingText}>
            {isWorkspaceScope ? "Loading workspace members…" : "Searching Alenio…"}
          </Text>
        </View>
      ) : isError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Search unavailable</Text>
          <Text style={styles.emptyCopy}>Please try again in a moment.</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No people found</Text>
          <Text style={styles.emptyCopy}>
            {isWorkspaceScope
              ? trimmed
                ? "No workspace members match this search."
                : "Your workspaces have no other members to show."
              : "Check the spelling or try a different username."}
          </Text>
        </View>
      ) : (
        <View style={styles.results}>
          <Text style={styles.resultsLabel}>
            {results.length} RESULT{results.length === 1 ? "" : "S"}
          </Text>
          <View style={styles.resultsCard}>
            {results.map((person, index) => {
              const canRequest =
                !person.isBlockedByMe &&
                !person.isBlockedByThem &&
                (person.connectionStatus === "none" ||
                  person.connectionStatus === "declined");
              const canAccept =
                !person.isBlockedByMe &&
                !person.isBlockedByThem &&
                person.connectionStatus === "pending_incoming";
              const busy = Boolean(
                connectionMutation.isPending &&
                  connectionMutation.variables?.userId === person.id,
              );

              return (
                <View key={person.id}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <View style={styles.personRow}>
                    <Pressable
                      onPress={() => openPerson(person.id)}
                      style={styles.personMain}
                      accessibilityRole="button"
                    >
                      <UserAvatar
                        user={person}
                        size={46}
                        radius={23}
                        backgroundColor="#EFE9FF"
                        textColor={colors.brand}
                        fontSize={15}
                      />
                      <View style={styles.personCopy}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {person.name?.trim() || "Alenio member"}
                        </Text>
                        {person.username ? (
                          <Text style={styles.personMeta} numberOfLines={1}>
                            @{person.username}
                          </Text>
                        ) : null}
                        {person.sharedWorkspaceName ? (
                          <View style={styles.relationshipBadge}>
                            <Building2 size={10} color="#4E63D8" strokeWidth={2.4} />
                            <Text
                              style={styles.relationshipBadgeText}
                              numberOfLines={1}
                            >
                              Shared Workspace · {person.sharedWorkspaceName}
                            </Text>
                          </View>
                        ) : !person.username ? (
                          <Text style={styles.personMeta}>Alenio</Text>
                        ) : null}
                      </View>
                    </Pressable>

                    {canRequest || canAccept ? (
                      <Pressable
                        onPress={() =>
                          connectionMutation.mutate({
                            userId: person.id,
                            action: canAccept ? "accept" : "request",
                          })
                        }
                        disabled={busy}
                        style={styles.connectButton}
                        accessibilityRole="button"
                        accessibilityLabel={
                          canAccept
                            ? `Accept ${person.name ?? "connection"}`
                            : `Connect with ${person.name ?? "person"}`
                        }
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={colors.brand} />
                        ) : (
                          <>
                            {canAccept ? (
                              <Check size={14} color={colors.brand} />
                            ) : (
                              <UserPlus size={14} color={colors.brand} />
                            )}
                            <Text style={styles.connectText}>
                              {canAccept ? "Accept" : "Connect"}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    ) : (
                      <View
                        style={[
                          styles.statusBadge,
                          person.connectionStatus === "connected"
                            ? styles.statusConnected
                            : null,
                        ]}
                      >
                        {person.connectionStatus === "connected" ? (
                          <Check size={12} color="#168A55" />
                        ) : (
                          <Clock size={12} color="#78869A" />
                        )}
                        <Text
                          style={[
                            styles.statusText,
                            person.connectionStatus === "connected"
                              ? styles.statusTextConnected
                              : null,
                          ]}
                        >
                          {person.isBlockedByMe
                            ? "Blocked"
                            : person.isBlockedByThem
                              ? "Unavailable"
                              : person.connectionStatus === "connected"
                                ? "Connected"
                                : "Requested"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  scopeSection: {
    marginBottom: 12,
  },
  scopeControl: {
    height: 38,
    padding: 3,
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E3E8F0",
    backgroundColor: "#F2F5F9",
  },
  scopeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 9,
  },
  scopeOptionActive: {
    borderWidth: 1,
    borderColor: "#D7DEFA",
    backgroundColor: "#FFFFFF",
    shadowColor: "#526078",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  scopeOptionText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#7D899C",
  },
  scopeOptionTextActive: {
    color: colors.brand,
  },
  scopeHelp: {
    marginTop: 6,
    marginHorizontal: 4,
    fontSize: 10.5,
    color: "#8995A7",
  },
  searchWrap: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E4E9F1",
    backgroundColor: "#F6F8FB",
  },
  searchInput: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    fontSize: 14,
    color: "#111827",
  },
  intro: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 38,
    paddingBottom: 32,
  },
  introIcon: {
    width: 58,
    height: 58,
    marginBottom: 15,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDE5FF",
    backgroundColor: "#F0F4FF",
  },
  introTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#182033",
  },
  introCopy: {
    maxWidth: 270,
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: "#7C899D",
  },
  loadingState: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C899D",
  },
  emptyState: {
    minHeight: 170,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
  },
  emptyCopy: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    color: "#8A96A8",
  },
  results: {
    marginTop: 18,
  },
  resultsLabel: {
    marginBottom: 8,
    marginLeft: 3,
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: "#98A3B5",
  },
  resultsCard: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4E9F1",
    backgroundColor: "#FFFFFF",
  },
  personRow: {
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  personMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  personName: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#172033",
  },
  personMeta: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    color: "#8390A3",
  },
  relationshipBadge: {
    maxWidth: "100%",
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#DDE3FF",
    backgroundColor: "#F3F5FF",
  },
  relationshipBadgeText: {
    flexShrink: 1,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: "700",
    color: "#4E63D8",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 69,
    backgroundColor: "#E8ECF2",
  },
  connectButton: {
    minWidth: 82,
    height: 32,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#AFC0FF",
    backgroundColor: "#F8FAFF",
  },
  connectText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.brand,
  },
  statusBadge: {
    height: 29,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 9,
    backgroundColor: "#F1F4F8",
  },
  statusConnected: {
    backgroundColor: "#ECFDF5",
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#78869A",
  },
  statusTextConnected: {
    color: "#168A55",
  },
});
