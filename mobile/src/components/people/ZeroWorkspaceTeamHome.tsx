import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  findNodeHandle,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock,
  MessageCircle,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  X,
  Users,
  Newspaper,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { UserAvatar } from "@/components/UserAvatar";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { ConnectRequestConfirmationSheet } from "@/components/ConnectRequestConfirmationSheet";
import { DismissSuggestionConfirmationSheet } from "@/components/DismissSuggestionConfirmationSheet";
import { SuggestionPersonCard } from "@/components/people/SuggestionPersonCard";
import { PersonalFeedList } from "@/components/people/PersonalFeedList";
import { SegmentedControl } from "@/components/ui";
import {
  connectionRequestOutcome,
  type ConnectionRequestOutcome,
} from "@/lib/connection-request-outcome";
import { connectionRequestErrorMessage } from "@/lib/connection-request-error";
import { dmOtherParticipant, resolveUserImageUrl } from "@/lib/user-avatar";
import type {
  AcceptedConnectionEntry,
  ConnectionRequestResponse,
  ConnectionSuggestion,
  ConnectionSuggestionDismissalResponse,
  ConnectionsResponse,
  Conversation,
  PersonSearchResult,
} from "@/lib/types";
import type { AddConnectionEntryMode } from "@/components/people/AddConnectionSheet";
import {
  CONTENT_MAX_WIDTH,
  useAdaptiveLayout,
  useStatusClusterInset,
} from "@/lib/adaptive-layout";
import { useTabBarClearanceFn } from "@/lib/tab-bar";
import { colors, elevation, typography } from "@/theme";
import { WS } from "@/components/workspace/workspace-ui";
import {
  CONNECTION_DIRECTORY_SORT_LABELS,
  connectionIndexLetter,
  filterConnectionDirectory,
  sortConnectionDirectory,
  type ConnectionDirectoryFilters,
  type ConnectionDirectorySort,
} from "@/lib/connection-directory";

const BRAND = colors.brand;
const GRID_GAP = 10;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type NetworkTab = "feed" | "connections";

/** Phone stays one column. Tablets get two. Wide screens get three. */
function networkColumns(width: number) {
  if (width >= 1080) return 3;
  if (width >= 700) return 2;
  return 1;
}

/** Suggestion cards stay narrow, so a phone can hold two. */
function discoverColumns(width: number) {
  if (width >= 1080) return 3;
  if (width >= 360) return 2;
  return 1;
}

function columnWidth(width: number, columns: number) {
  if (columns <= 1 || width <= 0) return undefined;
  return Math.floor((width - GRID_GAP * (columns - 1)) / columns);
}

/** Their title and handle; the shared-workspace badge already carries the workspace. */
function existingDirectConversation(
  conversations: Conversation[],
  personId: string,
  currentUserId: string,
) {
  return (
    conversations.find((conversation) => {
      if (conversation.isGroup) return false;
      return dmOtherParticipant(conversation, currentUserId)?.id === personId;
    }) ?? null
  );
}

function connectionRowDetail(entry: AcceptedConnectionEntry) {
  const title = entry.person.profileTitle?.trim();
  const handle = entry.person.username ? `@${entry.person.username}` : null;
  if (title && handle) return `${title} · ${handle}`;
  return title ?? handle;
}

export function ZeroWorkspaceTeamHome({
  initialTab,
  onAddConnection,
  searchQuery,
  onSearchChange,
  onOpenFilters,
  activeFilterCount = 0,
  filters,
}: {
  initialTab?: NetworkTab;
  onAddConnection: (mode?: AddConnectionEntryMode) => void;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  onOpenFilters?: () => void;
  activeFilterCount?: number;
  filters?: ConnectionDirectoryFilters;
}) {
  const tabClearance = useTabBarClearanceFn();
  const bottomNavigationClearance = tabClearance(8);
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [requestOutcomes, setRequestOutcomes] = useState<
    Record<string, ConnectionRequestOutcome>
  >({});
  const [tab, setTab] = useState<NetworkTab>(initialTab ?? "feed");
  const [paneWidth, setPaneWidth] = useState(0);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [menuConnection, setMenuConnection] =
    useState<AcceptedConnectionEntry | null>(null);
  const [openingChatFor, setOpeningChatFor] = useState<string | null>(null);
  const [sort, setSort] = useState<ConnectionDirectorySort>("name");
  const listScrollRef = useRef<ScrollView>(null);
  const listContentRef = useRef<View>(null);
  const letterAnchors = useRef<Partial<Record<string, View | null>>>({});
  const [suggestionToDismiss, setSuggestionToDismiss] = useState<{
    id: string;
    name: string | null;
    image: string | null;
  } | null>(null);
  /** A connection request is visible to the other person, so it is confirmed. */
  const [suggestionToConnect, setSuggestionToConnect] = useState<{
    id: string;
    name: string | null;
    image: string | null;
    title: string | null;
  } | null>(null);
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  const suggestionsKey = ["connection-suggestions", "global"] as const;
  const {
    data: connections,
    isLoading: connectionsLoading,
    isError: connectionsError,
    refetch: refetchConnections,
  } = useQuery({
    queryKey: ["connections", currentUserId],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
    enabled: currentUserId.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const accepted = useMemo(() => connections?.accepted ?? [], [connections]);
  const normalizedSearch = searchQuery?.trim().toLowerCase() ?? "";
  const matchingConnections = useMemo(
    () =>
      filterConnectionDirectory(accepted, {
        search: normalizedSearch,
        filters,
      }),
    [accepted, filters, normalizedSearch],
  );
  const hasActiveFilters = Boolean(
    filters?.active || filters?.recent || filters?.sharedWorkspace,
  );
  const connectionPreview = useMemo(
    () => sortConnectionDirectory(matchingConnections, sort),
    [matchingConnections, sort],
  );
  const indexLetters = useMemo(() => {
    const present = new Set<string>();
    for (const entry of connectionPreview)
      present.add(connectionIndexLetter(entry));
    return present;
  }, [connectionPreview]);
  const showLetterIndex =
    tab === "connections" &&
    !connectionsLoading &&
    !connectionsError &&
    connectionPreview.length >= 8;
  const resolvingEmptyState = connectionsLoading;
  const centerEmptyState =
    !connectionsLoading &&
    !connectionsError &&
    tab === "connections" &&
    accepted.length === 0 &&
    normalizedSearch.length === 0 &&
    !hasActiveFilters;
  useEffect(() => {
    if (!connections) return;
    const acceptedIds = new Set(
      connections.accepted.map((entry) => entry.person.id),
    );
    const outgoingIds = new Set(
      connections.outgoing.map((entry) => entry.person.id),
    );
    setRequestOutcomes((current) => {
      let changed = false;
      const next = { ...current };
      for (const [userId, outcome] of Object.entries(current)) {
        const stillCurrent = outcome.isConnected
          ? acceptedIds.has(userId)
          : outgoingIds.has(userId);
        if (!stillCurrent) {
          delete next[userId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [connections]);

  const connectMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<ConnectionRequestResponse>("/api/connections/request", {
        userId,
      }),
    onMutate: (userId) => {
      const suggestion = queryClient
        .getQueryData<ConnectionSuggestion[]>(suggestionsKey)
        ?.find((item) => item.person.id === userId);
      return { suggestion };
    },
    onError: (error: unknown) => {
      setSuggestionToConnect(null);
      toast({ title: connectionRequestErrorMessage(error), preset: "error" });
    },
    onSuccess: (response, userId, context) => {
      setSuggestionToConnect(null);
      const outcome = connectionRequestOutcome(response);
      setRequestOutcomes((current) => ({ ...current, [userId]: outcome }));
      const connectedPerson = context?.suggestion;
      if (outcome.isConnected && connectedPerson) {
        const now = new Date().toISOString();
        queryClient.setQueryData<ConnectionsResponse>(
          ["connections", currentUserId],
          (current) => {
            const accepted = current?.accepted ?? [];
            if (accepted.some((item) => item.person.id === userId)) {
              return current;
            }
            return {
              accepted: [
                {
                  id: `connected-${userId}`,
                  person: connectedPerson.person,
                  status: "connected",
                  createdAt: now,
                  updatedAt: now,
                  activeNow: false,
                  sharesWorkspace:
                    connectedPerson.sharedCurrentWorkspace ||
                    connectedPerson.sharedWorkspaces.length > 0,
                },
                ...accepted,
              ],
              incoming: current?.incoming ?? [],
              outgoing: (current?.outgoing ?? []).filter(
                (item) => item.person.id !== userId,
              ),
            };
          },
        );
      }
      toast({
        title: outcome.toastTitle,
        preset: "done",
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({
        queryKey: ["connection-suggestions"],
      });
      void queryClient.invalidateQueries({ queryKey: ["user-search"] });
    },
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

  const directChats = useQuery({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
  });

  const openDirectChat = (
    conversation: {
      id: string;
      recipient?: { name?: string | null; image?: string | null } | null;
    },
    connection: AcceptedConnectionEntry,
  ) => {
    router.push({
      pathname: "/dm-chat",
      params: {
        conversationId: conversation.id,
        recipientName:
          conversation.recipient?.name ??
          connection.person.name ??
          "Direct Message",
        recipientImage:
          resolveUserImageUrl(
            conversation.recipient?.image ?? connection.person.image,
          ) ?? "",
        isGroup: "false",
      },
    });
  };

  const onMessagePress = async (connection: AcceptedConnectionEntry) => {
    if (openingChatFor) return;
    setOpeningChatFor(connection.person.id);
    try {
      const list = directChats.isSuccess
        ? (directChats.data ?? [])
        : await queryClient.fetchQuery({
            queryKey: ["dms"],
            queryFn: () => api.get<Conversation[]>("/api/dms"),
          });
      const existing = existingDirectConversation(
        list,
        connection.person.id,
        currentUserId,
      );
      if (existing) {
        openDirectChat(existing, connection);
        return;
      }
      router.push({
        pathname: "/dm-chat",
        params: {
          recipientId: connection.person.id,
          recipientName: connection.person.name ?? "Direct Message",
          recipientImage: resolveUserImageUrl(connection.person.image) ?? "",
          isGroup: "false",
        },
      });
    } catch (error: unknown) {
      toast({
        title:
          error instanceof Error
            ? error.message
            : "Couldn't open message",
        preset: "error",
      });
    } finally {
      setOpeningChatFor(null);
    }
  };

  const openPerson = (userId: string) =>
    router.push({ pathname: "/person", params: { userId } });

  const jumpToLetter = (letter: string, animated: boolean) => {
    const target = letterAnchors.current[letter];
    const content = listContentRef.current;
    const relative = content ? findNodeHandle(content) : null;
    if (!target || relative == null) return;
    target.measureLayout(
      relative,
      (_x, y) => {
        listScrollRef.current?.scrollTo({ y: Math.max(0, y - 4), animated });
      },
      () => {},
    );
  };

  // Feed | People tabs on every width — Feed is the product of this tab;
  // People is browse, not a permanent side column.
  const { width: windowWidth } = useWindowDimensions();
  const { columnWidth: adaptiveColumnWidth } = useAdaptiveLayout();
  const statusCluster = useStatusClusterInset();
  const directoryActive = normalizedSearch.length > 0 || hasActiveFilters;
  const activeTab = tab;
  const layoutWidth = paneWidth || Math.max(0, windowWidth - 32);
  const columns = networkColumns(layoutWidth);
  const cardWidth = columnWidth(layoutWidth, columns);
  const suggestionColumns = discoverColumns(layoutWidth);
  const suggestionCardWidth = columnWidth(layoutWidth, suggestionColumns);

  const peopleSearchRow = (
    <View style={styles.connectionSearchRow}>
      <View style={styles.connectionSearch} testID="no-workspace-search">
        <Search size={14} color="#8A96A8" strokeWidth={2.1} />
        <TextInput
          value={searchQuery ?? ""}
          onChangeText={onSearchChange}
          placeholder="Search by name, role, or workspace..."
          placeholderTextColor="#8A96A8"
          style={styles.connectionSearchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search people"
          testID="connections-search-input"
        />
        {(searchQuery ?? "").length > 0 ? (
          <Pressable
            onPress={() => onSearchChange?.("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear people search"
          >
            <X size={14} color="#8A96A8" strokeWidth={2.1} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={onOpenFilters}
        style={[
          styles.connectionFilterButton,
          activeFilterCount > 0 ? styles.connectionFilterButtonActive : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          activeFilterCount > 0
            ? `Filter people, ${activeFilterCount} active`
            : "Filter people"
        }
        testID="connections-filter-button"
      >
        <SlidersHorizontal
          size={13}
          color={activeFilterCount > 0 ? "#111827" : "#667085"}
          strokeWidth={2.2}
        />
        <Text
          style={[
            styles.connectionFilterLabel,
            activeFilterCount > 0 ? styles.connectionFilterLabelActive : null,
          ]}
        >
          Filters
          {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
        </Text>
      </Pressable>
    </View>
  );

  const peopleDirectory = (
    <View style={styles.listFrame} testID="network-people-pane">
      <ScrollView
        ref={listScrollRef}
        style={styles.scroller}
        contentContainerStyle={[
          styles.page,
          { paddingBottom: bottomNavigationClearance },
          showLetterIndex ? styles.pageIndexed : null,
          resolvingEmptyState || centerEmptyState ? styles.pageFill : null,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          ref={listContentRef}
          collapsable={false}
          style={centerEmptyState ? styles.emptyPageFrame : null}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            setPaneWidth((current) => (current === next ? current : next));
          }}
        >
          <ConnectionsPane
            loading={connectionsLoading && !connections}
            error={connectionsError}
            onRetry={() => void refetchConnections()}
            entries={connectionPreview}
            total={accepted.length}
            filtering={directoryActive}
            columns={columns}
            cardWidth={cardWidth}
            sort={sort}
            sortLabel={CONNECTION_DIRECTORY_SORT_LABELS[sort]}
            onSort={() => setSortSheetOpen(true)}
            onOpen={openPerson}
            onMenu={setMenuConnection}
            registerLetter={(letter, node) => {
              letterAnchors.current[letter] = node;
            }}
          />
        </View>
      </ScrollView>
      {showLetterIndex ? (
        <AlphabetRail
          present={indexLetters}
          bottomInset={bottomNavigationClearance}
          onJump={jumpToLetter}
        />
      ) : null}
    </View>
  );

  const personalFeed = (
    <View style={styles.listFrame} testID="personal-feed-pane">
      <PersonalFeedList onFindPeople={() => onAddConnection("all")} />
    </View>
  );

  return (
    <View style={styles.screen} testID="zero-workspace-team-home">
      <View
        style={[
          styles.networkHeader,
          {
            // Match WorkspaceViewToggle: same column width + page gutters.
            alignSelf: "center",
            width: "100%",
            maxWidth: Math.min(adaptiveColumnWidth, CONTENT_MAX_WIDTH),
            paddingLeft: WS.pageGutter + statusCluster.left,
            paddingRight: WS.pageGutter + statusCluster.right,
          },
        ]}
      >
        <SegmentedControl
          options={[
            { key: "feed", label: "Feed", Icon: Newspaper },
            { key: "connections", label: "People", Icon: Users },
          ]}
          value={activeTab}
          onChange={setTab}
          testID="feed-view-toggle"
          testIDPrefix="network-tab"
        />
        {activeTab === "connections" ? peopleSearchRow : null}
      </View>
      {activeTab === "feed" ? personalFeed : peopleDirectory}
      <ConnectRequestConfirmationSheet
        person={suggestionToConnect}
        pending={connectMutation.isPending}
        onClose={() => setSuggestionToConnect(null)}
        onConfirm={() => {
          if (suggestionToConnect) {
            connectMutation.mutate(suggestionToConnect.id);
          }
        }}
      />
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
      <AlenioBottomSheet
        visible={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        title="Sort people"
        subtitle={CONNECTION_DIRECTORY_SORT_LABELS[sort]}
        compact
        scrollEnabled={false}
        testID="connections-sort-sheet"
      >
        {(["recent", "name", "active"] as const).map((option) => {
          const selected = sort === option;
          return (
            <Pressable
              key={option}
              onPress={() => {
                setSort(option);
                setSortSheetOpen(false);
              }}
              style={styles.sortOption}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={CONNECTION_DIRECTORY_SORT_LABELS[option]}
              testID={`connections-sort-${option}`}
            >
              <Text
                style={
                  selected
                    ? styles.sortOptionLabelSelected
                    : styles.sortOptionLabel
                }
              >
                {CONNECTION_DIRECTORY_SORT_LABELS[option]}
              </Text>
              {selected ? (
                <Check size={16} color={BRAND} strokeWidth={2.6} />
              ) : null}
            </Pressable>
          );
        })}
      </AlenioBottomSheet>
      <AlenioBottomSheet
        visible={menuConnection != null}
        onClose={() => setMenuConnection(null)}
        title={menuConnection?.person.name?.trim() || "Connection"}
        subtitle={
          menuConnection
            ? (connectionRowDetail(menuConnection) ?? undefined)
            : undefined
        }
        compact
        scrollEnabled={false}
        testID="connection-overflow-sheet"
      >
        <Pressable
          onPress={() => {
            const userId = menuConnection?.person.id;
            setMenuConnection(null);
            if (userId) openPerson(userId);
          }}
          style={styles.menuRow}
          accessibilityRole="button"
          accessibilityLabel="View profile"
          testID="connection-overflow-profile"
        >
          <Text style={styles.menuLabel}>View profile</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const connection = menuConnection;
            setMenuConnection(null);
            if (connection) void onMessagePress(connection);
          }}
          style={styles.menuRow}
          accessibilityRole="button"
          accessibilityLabel="Message"
          testID="connection-overflow-message"
        >
          <Text style={styles.menuLabel}>Message</Text>
        </Pressable>
      </AlenioBottomSheet>
    </View>
  );
}

function letterGroups(entries: AcceptedConnectionEntry[]) {
  const groups: Array<[string, AcceptedConnectionEntry[]]> = [];
  for (const entry of entries) {
    const letter = connectionIndexLetter(entry);
    const last = groups[groups.length - 1];
    if (last && last[0] === letter) last[1].push(entry);
    else groups.push([letter, [entry]]);
  }
  return groups;
}

function ConnectionRow({
  entry,
  cardWidth,
  onOpen,
  onMenu,
  anchorRef,
}: {
  entry: AcceptedConnectionEntry;
  cardWidth?: number;
  onOpen: (userId: string) => void;
  onMenu: (entry: AcceptedConnectionEntry) => void;
  anchorRef?: (node: View | null) => void;
}) {
  const name = entry.person.name?.trim() || "Alenio member";
  const detail = connectionRowDetail(entry);
  return (
    <View
      ref={anchorRef}
      collapsable={false}
      style={cardWidth ? { width: cardWidth } : styles.personCardFull}
    >
      <Pressable
        onPress={() => onOpen(entry.person.id)}
        style={[styles.personCard, styles.personCardFull]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s profile`}
        testID={`zero-workspace-connection-${entry.person.id}`}
      >
        <UserAvatar
          user={{ ...entry.person, activeNow: entry.activeNow }}
          size={40}
          radius={20}
          backgroundColor="#EFE9FF"
          textColor={BRAND}
          fontSize={14}
        />
        <View style={styles.personCopy}>
          <Text style={styles.personName} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.personMetaRow}>
            {detail ? (
              <Text style={styles.personMeta} numberOfLines={1}>
                {detail}
              </Text>
            ) : (
              <Text style={styles.personMeta} numberOfLines={1}>
                {entry.sharesWorkspace ? "Workspace" : "Personal"}
              </Text>
            )}
          </View>
        </View>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onMenu(entry);
          }}
          hitSlop={8}
          style={styles.moreButton}
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${name}`}
          testID={`connection-more-${entry.person.id}`}
        >
          <MoreHorizontal size={18} color="#667085" strokeWidth={2.2} />
        </Pressable>
      </Pressable>
    </View>
  );
}

function nearestLetter(letter: string, present: Set<string>) {
  if (present.has(letter)) return letter;
  const letters = present.has("#") ? ["#", ...ALPHABET] : ALPHABET;
  const index = Math.max(0, letters.indexOf(letter));
  for (let distance = 1; distance < letters.length; distance += 1) {
    const after = letters[index + distance];
    const before = letters[index - distance];
    if (after && present.has(after)) return after;
    if (before && present.has(before)) return before;
  }
  return null;
}

function AlphabetRail({
  present,
  bottomInset,
  onJump,
}: {
  present: Set<string>;
  bottomInset: number;
  onJump: (letter: string, animated: boolean) => void;
}) {
  const heightRef = useRef(1);
  const [scrub, setScrub] = useState<string | null>(null);
  const [scrubY, setScrubY] = useState(0);

  const letters = present.has("#") ? ["#", ...ALPHABET] : ALPHABET;

  const pick = (y: number) => {
    const index = Math.min(
      letters.length - 1,
      Math.max(0, Math.floor((y / heightRef.current) * letters.length)),
    );
    return letters[index] ?? "A";
  };

  const jump = (y: number, animated: boolean) => {
    const letter = nearestLetter(pick(y), present);
    setScrubY(y);
    setScrub(letter);
    if (letter) onJump(letter, animated);
  };

  return (
    <View
      style={[styles.alphaRail, { bottom: bottomInset }]}
      onLayout={(event) => {
        heightRef.current = event.nativeEvent.layout.height;
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => jump(event.nativeEvent.locationY, true)}
      onResponderMove={(event) => jump(event.nativeEvent.locationY, false)}
      onResponderRelease={() => setScrub(null)}
      onResponderTerminate={() => setScrub(null)}
      accessibilityRole="adjustable"
      accessibilityLabel="Connection letters"
      testID="connections-alpha-index"
    >
      {scrub ? (
        <View
          pointerEvents="none"
          style={[styles.alphaBubble, { top: Math.max(0, scrubY - 22) }]}
        >
          <Text style={styles.alphaBubbleText}>{scrub}</Text>
        </View>
      ) : null}
      {letters.map((letter) => (
        <View key={letter} style={styles.alphaLetterWrap}>
          <Text
            style={[
              styles.alphaLetter,
              present.has(letter) ? styles.alphaLetterOn : null,
            ]}
          >
            {letter}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CardGrid({
  columns,
  children,
}: {
  columns: number;
  children: ReactNode;
}) {
  return (
    <View style={[styles.grid, columns === 1 ? styles.gridStack : null]}>
      {children}
    </View>
  );
}

function ConnectionsPane({
  loading,
  error,
  onRetry,
  entries,
  total,
  filtering,
  columns,
  cardWidth,
  sort,
  sortLabel,
  onSort,
  onOpen,
  onMenu,
  registerLetter,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  entries: AcceptedConnectionEntry[];
  total: number;
  filtering: boolean;
  columns: number;
  cardWidth?: number;
  sort: ConnectionDirectorySort;
  sortLabel: string;
  onSort: () => void;
  onOpen: (userId: string) => void;
  onMenu: (entry: AcceptedConnectionEntry) => void;
  registerLetter: (letter: string, node: View | null) => void;
}) {
  return (
    <View
      style={
        !loading && !error && entries.length === 0 && !filtering
          ? styles.emptyPaneHost
          : null
      }
    >
      {total > 0 || filtering ? (
        <View style={styles.paneHeader}>
          <Text style={styles.paneTitle}>
            {total > 0 ? `People · ${total}` : "People"}
          </Text>
          {total > 0 ? (
            <Pressable
              onPress={onSort}
              hitSlop={8}
              style={styles.sortControl}
              accessibilityRole="button"
              accessibilityLabel={`Sort people, currently ${sortLabel}`}
              testID="connections-sort"
            >
              <Text style={styles.sortLabel}>Sort</Text>
              <ArrowUpDown size={13} color={BRAND} strokeWidth={2.4} />
              <ChevronDown size={13} color="#94A3B8" strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {loading ? (
        <CardGrid columns={columns}>
          {Array.from({ length: columns * 2 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.personCard,
                cardWidth ? { width: cardWidth } : styles.personCardFull,
              ]}
            >
              <View style={styles.boneAvatar} />
              <View style={styles.boneCopy}>
                <View style={styles.boneName} />
                <View style={styles.boneMeta} />
              </View>
            </View>
          ))}
        </CardGrid>
      ) : error ? (
        <InlineState
          message="People could not be loaded."
          action="Try again"
          onPress={onRetry}
          testID="connections-error"
        />
      ) : entries.length > 0 ? (
        <View testID="connections-list" style={styles.gridWrap}>
          {sort === "name" ? (
            letterGroups(entries).map(([letter, group]) => (
              <View
                key={letter}
                collapsable={false}
                ref={(node) => registerLetter(letter, node)}
              >
                <Text style={styles.alphaHeading}>{letter}</Text>
                <CardGrid columns={columns}>
                  {group.map((entry) => (
                    <ConnectionRow
                      key={entry.id}
                      entry={entry}
                      cardWidth={cardWidth}
                      onOpen={onOpen}
                      onMenu={onMenu}
                    />
                  ))}
                </CardGrid>
              </View>
            ))
          ) : (
            <CardGrid columns={columns}>
              {(() => {
                const seen = new Set<string>();
                return entries.map((entry) => {
                  const letter = connectionIndexLetter(entry);
                  const first = !seen.has(letter);
                  if (first) seen.add(letter);
                  return (
                    <ConnectionRow
                      key={entry.id}
                      entry={entry}
                      cardWidth={cardWidth}
                      onOpen={onOpen}
                      onMenu={onMenu}
                      anchorRef={
                        first
                          ? (node) => registerLetter(letter, node)
                          : undefined
                      }
                    />
                  );
                });
              })()}
            </CardGrid>
          )}
        </View>
      ) : filtering ? (
        <View style={styles.searchEmpty} testID="connections-no-search-results">
          <Text style={styles.searchEmptyText}>No people found</Text>
        </View>
      ) : (
        <ConnectionsEmptyState />
      )}
    </View>
  );
}

const WOMAN_TEAL = require("@/assets/connection-person-woman-teal.png");
const WOMAN_CURLS = require("@/assets/connection-person-woman-curls.png");

function NetworkPaneEmpty({
  testID,
  art,
  title,
  body,
}: {
  testID: string;
  art: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.paneEmpty} testID={testID}>
      {art}
      <Text style={styles.connectionsEmptyTitle}>{title}</Text>
      <Text style={styles.connectionsEmptyText}>{body}</Text>
      <View style={styles.connectionsEmptyAccent} />
    </View>
  );
}

function Portrait({
  source,
  style,
}: {
  source: number;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.paneEmptyPhoto, style]}>
      <Image source={source} style={styles.paneEmptyPhotoImage} />
    </View>
  );
}

function DiscoverEmptyState() {
  return (
    <NetworkPaneEmpty
      testID="discover-empty"
      art={
        <View style={styles.paneEmptyArt} accessibilityElementsHidden>
          <View style={[styles.paneEmptyHalo, styles.paneEmptyHaloTeal]} />
          <Portrait source={WOMAN_CURLS} style={styles.paneEmptyPhotoLeft} />
          <Portrait source={WOMAN_TEAL} style={styles.paneEmptyPhotoRight} />
          <View style={styles.paneEmptyMark}>
            <Newspaper size={22} color={BRAND} strokeWidth={2} />
          </View>
        </View>
      }
      title="No suggestions yet"
      body="Search for someone you already know by name, username, or email."
    />
  );
}

function DiscoverPane({
  query,
  loading,
  suggestions,
  outcomes,
  connectingId,
  connectDisabled,
  dismissingId,
  columns,
  cardWidth,
  onOpen,
  onConnect,
  onDismiss,
}: {
  query: string;
  loading: boolean;
  suggestions: ConnectionSuggestion[];
  outcomes: Record<string, ConnectionRequestOutcome>;
  connectingId?: string;
  connectDisabled: boolean;
  dismissingId?: string;
  columns: number;
  cardWidth?: number;
  onOpen: (userId: string) => void;
  onConnect: (suggestion: ConnectionSuggestion) => void;
  onDismiss: (suggestion: ConnectionSuggestion) => void;
}) {
  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const showResults = loading || suggestions.length > 0;
  return (
    <View
      style={
        !searching && !loading && suggestions.length === 0
          ? styles.emptyPaneHost
          : null
      }
    >
      {searching ? (
        <DiscoverSearchResults query={trimmed} onOpen={onOpen} />
      ) : showResults ? (
        <View style={styles.paneHeader}>
          <View>
            <Text style={styles.paneTitle}>People you may know</Text>
            <Text style={styles.paneSubtitle}>From your workspaces</Text>
          </View>
        </View>
      ) : null}
      {searching ? null : loading ? (
        <CardGrid columns={columns}>
          {Array.from({ length: columns * 2 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.discoverBone,
                cardWidth ? { width: cardWidth } : styles.personCardFull,
              ]}
            />
          ))}
        </CardGrid>
      ) : suggestions.length === 0 ? (
        <DiscoverEmptyState />
      ) : (
        <View style={styles.grid} testID="suggestions-list">
          {suggestions.map((suggestion) => (
            <View
              key={suggestion.person.id}
              style={cardWidth ? { width: cardWidth } : styles.personCardFull}
            >
              <SuggestionPersonCard
                suggestion={suggestion}
                fullWidth
                outcome={outcomes[suggestion.person.id]}
                connecting={connectingId === suggestion.person.id}
                connectDisabled={connectDisabled}
                dismissDisabled={dismissingId === suggestion.person.id}
                onOpen={() => onOpen(suggestion.person.id)}
                onConnect={() => onConnect(suggestion)}
                onDismiss={() => onDismiss(suggestion)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function DiscoverSearchResults({
  query,
  onOpen,
}: {
  query: string;
  onOpen: (userId: string) => void;
}) {
  const queryClient = useQueryClient();
  const canSearch = query.length >= 2;
  const {
    data: results = [],
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["user-search", "discover", query],
    queryFn: () =>
      api.get<PersonSearchResult[]>(
        `/api/users/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: canSearch,
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
    onSuccess: ({ response, action }) => {
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

  if (!canSearch) {
    return (
      <Text style={styles.discoverSearchHint}>
        Keep typing to search Alenio.
      </Text>
    );
  }
  if (isFetching && results.length === 0) {
    return (
      <View style={styles.discoverSearchStatus}>
        <ActivityIndicator color={BRAND} />
        <Text style={styles.discoverSearchHint}>Searching Alenio…</Text>
      </View>
    );
  }
  if (isError) {
    return (
      <View style={[styles.requestEmptyCard, styles.discoverSearchCard]}>
        <View style={styles.requestEmptyCopy}>
          <Text style={styles.requestEmptyTitle}>Search unavailable</Text>
          <Text style={styles.requestEmptyBody}>
            Please try again in a moment.
          </Text>
        </View>
      </View>
    );
  }
  if (results.length === 0) {
    return (
      <View
        style={[styles.requestEmptyCard, styles.discoverSearchCard]}
        testID="discover-search-empty"
      >
        <View style={styles.requestEmptyCopy}>
          <Text style={styles.requestEmptyTitle}>No people found</Text>
          <Text style={styles.requestEmptyBody}>
            Check the spelling or try a different username.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.discoverSearchList} testID="discover-search-results">
      <Text style={styles.paneSubtitle}>
        {results.length} {results.length === 1 ? "person" : "people"} on Alenio
      </Text>
      {results.map((person) => {
        const name = person.name?.trim() || "Alenio member";
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
        const statusLabel = person.isBlockedByMe
          ? "Blocked"
          : person.isBlockedByThem
            ? "Unavailable"
            : person.connectionStatus === "connected"
              ? "Connected"
              : "Requested";
        return (
          <View key={person.id} style={styles.personCard}>
            <Pressable
              onPress={() => onOpen(person.id)}
              style={styles.discoverSearchIdentity}
              accessibilityRole="button"
              accessibilityLabel={`View ${name}`}
            >
              <UserAvatar
                user={person}
                size={40}
                radius={20}
                backgroundColor="#EFE9FF"
                textColor={BRAND}
                fontSize={14}
              />
              <View style={styles.personCopy}>
                <Text style={styles.personName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.personMeta} numberOfLines={1}>
                  {person.username
                    ? `@${person.username}`
                    : person.sharedWorkspaceName
                      ? person.sharedWorkspaceName
                      : "Alenio"}
                </Text>
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
                style={styles.requestAccept}
                accessibilityRole="button"
                accessibilityLabel={
                  canAccept ? `Accept ${name}` : `Connect with ${name}`
                }
                testID={`discover-search-connect-${person.id}`}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.requestAcceptLabel}>
                    {canAccept ? "Accept" : "Connect"}
                  </Text>
                )}
              </Pressable>
            ) : (
              <View
                style={[
                  styles.discoverStatus,
                  person.connectionStatus === "connected"
                    ? styles.discoverStatusConnected
                    : null,
                ]}
              >
                {person.connectionStatus === "connected" ? (
                  <Check size={12} color="#168A55" strokeWidth={2.4} />
                ) : (
                  <Clock size={12} color="#78869A" strokeWidth={2.2} />
                )}
                <Text
                  style={[
                    styles.discoverStatusLabel,
                    person.connectionStatus === "connected"
                      ? styles.discoverStatusLabelConnected
                      : null,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Section({
  title,
  subtitle,
  prominent = false,
  action,
  compactTop = false,
  fill = false,
  count,
  children,
}: {
  title?: string;
  subtitle?: string;
  /** Sentence-case heading with an optional subtitle, instead of the uppercase label. */
  prominent?: boolean;
  action?: ReactNode;
  compactTop?: boolean;
  /** Claims the leftover vertical space so a scrollable body can size itself. */
  fill?: boolean;
  /** Renders a pill beside the heading, e.g. the connection total. */
  count?: number;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        styles.section,
        compactTop ? styles.sectionCompactTop : null,
        fill ? styles.sectionFill : null,
      ]}
    >
      {title || action ? (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeading}>
            {title ? (
              <View style={styles.sectionTitleRow}>
                <Text
                  style={
                    prominent
                      ? styles.sectionTitleProminent
                      : styles.sectionTitle
                  }
                >
                  {title}
                </Text>
                {typeof count === "number" ? (
                  <View style={styles.sectionCountPill}>
                    <Text style={styles.sectionCountLabel}>{count}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {subtitle ? (
              <Text style={styles.sectionSubtitleText}>{subtitle}</Text>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function LoadingState({ label, testID }: { label: string; testID: string }) {
  return (
    <View style={styles.loadingState} testID={testID}>
      <ActivityIndicator size="small" color={BRAND} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

function ConnectionsEmptyState() {
  return (
    <NetworkPaneEmpty
      testID="connections-empty"
      art={
        <View style={styles.paneEmptyArt}>
          <Image
            source={require("@/assets/alenio-empty-connections-people.png")}
            style={styles.connectionsEmptyImage}
            resizeMode="contain"
            accessibilityLabel="A network of Alenio members"
            accessibilityIgnoresInvertColors
          />
        </View>
      }
      title="No one here yet"
      body="Search for someone you already know by name, username, or email."
    />
  );
}

function InlineState({
  message,
  action,
  onPress,
  testID,
}: {
  message: string;
  action: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <View style={styles.inlineState} testID={testID}>
      <Text style={styles.stateText}>{message}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={styles.stateAction}
      >
        <Text style={styles.stateActionText}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: "#FFFFFF" },
  scroller: { flex: 1, minHeight: 0 },
  listFrame: { flex: 1, minHeight: 0 },
  page: { paddingHorizontal: 16, paddingTop: 4 },
  pageIndexed: { paddingRight: 22 },
  alphaHeading: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#98A2B3",
  },
  alphaRail: {
    position: "absolute",
    top: 8,
    right: 0,
    width: 20,
    alignItems: "center",
    zIndex: 2,
  },
  alphaLetterWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  alphaLetter: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    color: "#D0D5DD",
  },
  alphaLetterOn: {
    color: BRAND,
  },
  alphaBubble: {
    position: "absolute",
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND,
  },
  alphaBubbleText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  networkHeader: {
    marginTop: 10,
    marginBottom: 6,
    gap: 10,
  },
  connectionSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  connectionSearch: {
    flex: 1,
    minWidth: 0,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "#FFFFFF",
  },
  connectionSearchInput: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    paddingVertical: 0,
    margin: 0,
    color: "#0F172A",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    textAlignVertical: "center",
  },
  connectionFilterButton: {
    height: 36,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "#FFFFFF",
  },
  connectionFilterButtonActive: {
    borderColor: "#D7DEE8",
    backgroundColor: "#F5F7FA",
  },
  connectionFilterLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#667085",
  },
  connectionFilterLabelActive: {
    color: "#111827",
  },
  pageFill: { flexGrow: 1 },
  emptyPageFrame: { flex: 1 },
  emptyPaneHost: { flex: 1 },
  tabs: {
    height: 38,
    padding: 3,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 9,
  },
  tabSelected: { backgroundColor: colors.brand },
  tabLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  tabLabelSelected: { fontWeight: "700", color: "#FFFFFF" },
  paneHeader: {
    marginTop: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  paneTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  paneSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  gridStack: { flexDirection: "column" },
  gridWrap: { width: "100%" },
  personCard: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E7EBF3",
    backgroundColor: "#FFFFFF",
  },
  personCardFull: { width: "100%" },
  personCopy: { flex: 1, minWidth: 0 },
  personName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#101828",
  },
  personMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  personMeta: { flexShrink: 1, fontSize: 12, lineHeight: 16, color: "#667085" },
  moreButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  boneAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E4E7EC",
  },
  boneCopy: { flex: 1, gap: 8 },
  boneName: {
    width: "62%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E4E7EC",
  },
  boneMeta: {
    width: "40%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EEF2F6",
  },
  discoverBone: {
    height: 148,
    borderRadius: 14,
    backgroundColor: "#F2F4F7",
  },
  discoverSearchCard: {
    marginTop: 16,
  },
  discoverSearchHint: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
  },
  discoverSearchStatus: {
    marginTop: 20,
    alignItems: "center",
    gap: 8,
  },
  discoverSearchList: {
    marginTop: 14,
    gap: 8,
  },
  discoverSearchIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  discoverStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#F2F4F7",
  },
  discoverStatusConnected: {
    backgroundColor: "#E9F8EF",
  },
  discoverStatusLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#667085",
  },
  discoverStatusLabelConnected: {
    color: "#168A55",
  },
  requestAccept: {
    height: 30,
    minWidth: 68,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND,
  },
  requestAcceptLabel: { fontSize: 12.5, fontWeight: "700", color: "#FFFFFF" },
  requestEmptyCard: {
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6EAF1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  requestEmptyCopy: { flex: 1, minWidth: 0, gap: 2 },
  requestEmptyTitle: { fontSize: 14, fontWeight: "800", color: "#101828" },
  requestEmptyBody: { fontSize: 12, lineHeight: 17, color: "#667085" },
  paneEmpty: {
    flex: 1,
    paddingTop: 18,
    paddingHorizontal: 8,
    paddingBottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  paneEmptyArt: {
    width: 220,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  paneEmptyHalo: {
    position: "absolute",
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: "#F3F1FF",
  },
  paneEmptyHaloTeal: { backgroundColor: "#EAF8F6" },
  paneEmptyPhoto: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#EFE9FF",
    overflow: "hidden",
    shadowColor: "#4654A7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 3,
  },
  paneEmptyPhotoImage: { width: "100%", height: "100%" },
  paneEmptyPhotoLeft: { left: 28, top: 28 },
  paneEmptyPhotoRight: { right: 28, top: 18 },
  paneEmptyMark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E8FF",
    shadowColor: "#5968D9",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  menuRow: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  menuLabel: { fontSize: 15, fontWeight: "700", color: "#101828" },
  /** flex 1 + minHeight 0 is what lets a section claim leftover height. */
  sectionFill: { flex: 1, minHeight: 0 },
  initialLoading: {
    flex: 1,
    minHeight: 460,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  initialLoadingText: {
    ...typography.meta,
    color: "#7A869A",
  },
  onboarding: {
    flex: 1,
    minHeight: 585,
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 22,
  },
  onboardingHeroArt: {
    position: "relative",
    width: 264,
    height: 235,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  orbitOuter: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1,
    borderColor: "#BFC9FF",
  },
  orbitInner: {
    position: "absolute",
    width: 142,
    height: 142,
    borderRadius: 71,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E6FF",
  },
  orbitDot: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#A9B6FF",
    shadowColor: BRAND,
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  orbitDotTop: { top: 31, left: 87 },
  orbitDotRight: { top: 105, right: 28 },
  orbitDotBottom: { bottom: 18, left: 119 },
  heroCenter: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E8FF",
    shadowColor: "#5968D9",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 13,
    elevation: 5,
  },
  heroPersonBadge: {
    position: "absolute",
    right: -7,
    bottom: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  heroAvatar: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#EFE9FF",
    shadowColor: "#4654A7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  heroAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 26,
  },
  heroAvatarTop: { top: 8, right: 35 },
  heroAvatarLeft: { top: 100, left: 15 },
  heroAvatarRight: { right: 7, bottom: 9 },
  avatarBadge: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#F4F3FF",
  },
  avatarBadgeTop: { top: -11, right: -13 },
  avatarBadgeLeft: { left: -14, bottom: -9 },
  avatarBadgeRight: { left: -13, bottom: -10 },
  onboardingTitle: {
    width: "100%",
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.55,
    color: "#172033",
    textAlign: "center",
  },
  onboardingBody: {
    maxWidth: 280,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
    color: "#71809A",
    textAlign: "center",
  },
  onboardingPrimary: {
    width: "100%",
    maxWidth: 238,
    height: 44,
    marginTop: 18,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BRAND,
  },
  onboardingPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  otherWays: {
    width: "100%",
    marginTop: 30,
  },
  otherWaysLabel: {
    marginBottom: 8,
    paddingHorizontal: 3,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#8693A9",
  },
  otherWaysCard: {
    overflow: "hidden",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E8EBF2",
    backgroundColor: "#FFFFFF",
    shadowColor: "#405078",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 9,
    elevation: 1,
  },
  otherWaysAction: {
    minHeight: 64,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  otherWaysDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 65,
    backgroundColor: "#EBEEF4",
  },
  otherWaysIcon: {
    width: 40,
    height: 40,
    marginRight: 12,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F1FF",
  },
  otherWaysCopy: {
    flex: 1,
    minWidth: 0,
  },
  otherWaysTitle: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    color: "#202B40",
  },
  otherWaysSubtitle: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#7D899D",
  },
  section: { marginTop: 18 },
  sectionCompactTop: { marginTop: 8 },
  sectionHeader: {
    minHeight: 18,
    marginBottom: 7,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  /** Area headings are bold and dark, not the uppercase muted label. */
  sectionTitle: {
    ...typography.sectionSubtitle,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#0F172A",
  },
  sectionHeading: { flex: 1, minWidth: 0 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sectionCountPill: {
    minWidth: 24,
    paddingHorizontal: 7,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  sectionCountLabel: {
    ...typography.metaTiny,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
    color: "#5B6879",
  },
  sortControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 8,
    minHeight: 30,
  },
  sortLabel: {
    ...typography.sectionSubtitle,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
    color: "#5B6879",
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 4,
  },
  sortOptionLabel: {
    ...typography.sectionSubtitle,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: "#475569",
  },
  sortOptionLabelSelected: {
    ...typography.sectionSubtitle,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: BRAND,
  },
  sectionTitleProminent: {
    ...typography.sectionSubtitle,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#0F172A",
  },
  sectionSubtitleText: {
    ...typography.metaTiny,
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 15,
    color: "#7A869A",
  },
  sectionSeeAll: {
    ...typography.sectionSubtitle,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
    color: BRAND,
  },
  suggestionRailWrap: { position: "relative" },
  suggestionRail: {
    flexDirection: "row",
    /**
     * Each card keeps its natural height. Stretching them to the rail left the
     * tallest one's leftover space inside every other card.
     */
    alignItems: "flex-start",
    gap: 10,
    /** Room for the cards' shadow, which a tight rail would clip. */
    paddingTop: 2,
    paddingBottom: 6,
    paddingRight: 4,
  },
  /** Keeps the last card clear of the pinned chevron. */
  suggestionRailInset: { paddingRight: 42 },
  suggestionRailMore: {
    position: "absolute",
    right: 0,
    top: "50%",
    marginTop: -17,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCE3F7",
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: -2, height: 2 },
    elevation: 3,
  },
  moreAvatar: {
    position: "relative",
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F2FF",
  },
  moreBadge: {
    position: "absolute",
    right: -1,
    bottom: 0,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: BRAND,
  },
  moreTitle: {
    ...typography.sectionSubtitle,
    minHeight: 26,
    marginTop: 3,
    paddingTop: 5,
    fontWeight: "600",
    color: "#172033",
  },
  connectionsCard: {
    overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E9F0",
    backgroundColor: "#FFFFFF",
  },
  connectionRow: {
    minHeight: 76,
    paddingVertical: 9,
    paddingHorizontal: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  connectionRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8ECF2",
  },
  connectionCopy: { flex: 1, minWidth: 0 },
  connectionName: {
    ...typography.rowTitle,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: "#172033",
  },
  connectionMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  connectionMeta: {
    ...typography.meta,
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#7A869A",
  },
  connectionTypeBadge: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
  },
  workspaceConnectionBadge: {
    borderColor: "#DDE3FF",
    backgroundColor: "#F3F5FF",
  },
  personalConnectionBadge: {
    borderColor: "#E4E7EC",
    backgroundColor: "#F8FAFC",
  },
  messageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E1E5FF",
    backgroundColor: "#FAFAFF",
  },
  messageButtonDisabled: { opacity: 0.5 },
  connectionsEmptyImage: {
    width: 220,
    height: 160,
  },
  connectionsEmptyTitle: {
    maxWidth: 260,
    marginTop: 7,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "800",
    color: "#172033",
    textAlign: "center",
    letterSpacing: -0.65,
  },
  connectionsEmptyText: {
    maxWidth: 255,
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#71809A",
    textAlign: "center",
  },
  connectionsEmptyAccent: {
    width: 24,
    height: 2,
    marginTop: 15,
    borderRadius: 1,
    backgroundColor: "#C5B9FF",
  },
  loadingState: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  inlineState: {
    minHeight: 50,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E7EAF1",
    backgroundColor: "#FAFBFD",
  },
  stateText: { ...typography.meta, flex: 1, lineHeight: 14, color: "#7A869A" },
  searchEmpty: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  searchEmptyText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: "#8A94A6",
  },
  stateAction: { paddingHorizontal: 8, paddingVertical: 7 },
  stateActionText: { ...typography.meta, fontWeight: "600", color: BRAND },
});
