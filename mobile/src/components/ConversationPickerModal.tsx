import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { MessageCircle, Search, Users, X } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import {
  filterSenecaConversations,
  senecaConversationLabel,
} from "@/lib/seneca-image-chat";
import type {
  AcceptedConnectionEntry,
  ConnectionsResponse,
  Conversation,
} from "@/lib/types";
import {
  dmOtherParticipant,
  resolveUserImageUrl,
} from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSelect: (conversation: Conversation) => void;
};

export function ConversationPickerModal({
  visible,
  title = "Send in Alenio",
  subtitle = "Choose a conversation or connection",
  onClose,
  onSelect,
}: Props) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id ?? "";
  const [search, setSearch] = useState<string>("");
  const {
    data: conversations = [],
    isLoading: conversationsLoading,
    isError: conversationsError,
    refetch: refetchConversations,
  } = useQuery<Conversation[]>({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    enabled: visible,
  });
  const {
    data: connectionsData,
    isLoading: connectionsLoading,
    isError: connectionsError,
    refetch: refetchConnections,
  } = useQuery<ConnectionsResponse>({
    queryKey: ["connections", currentUserId],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
    enabled: visible && currentUserId.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);

  const filteredConversations = useMemo(
    () => filterSenecaConversations(conversations, search, currentUserId),
    [conversations, currentUserId, search],
  );
  const availableConnections = useMemo(() => {
    const existingRecipientIds = new Set(
      conversations
        .filter((conversation) => !conversation.isGroup && conversation.type !== "GROUP")
        .map((conversation) => dmOtherParticipant(conversation, currentUserId)?.id)
        .filter((id): id is string => Boolean(id)),
    );
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return (connectionsData?.accepted ?? [])
      .filter((connection) => !existingRecipientIds.has(connection.person.id))
      .filter((connection) => {
        if (!normalizedSearch) return true;
        return [
          connection.person.name,
          connection.person.username,
          connection.person.email,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedSearch);
      })
      .sort((a, b) =>
        (a.person.name ?? "").localeCompare(b.person.name ?? "", undefined, {
          sensitivity: "base",
        }),
      );
  }, [connectionsData?.accepted, conversations, currentUserId, search]);
  const createDirectMessage = useMutation({
    mutationFn: (connection: AcceptedConnectionEntry) =>
      api.post<Conversation>("/api/dms/find-or-create", {
        recipientId: connection.person.id,
      }),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ["dms"] });
      onSelect(conversation);
    },
  });
  const isLoading = conversationsLoading || connectionsLoading;
  const isError =
    conversationsError &&
    connectionsError &&
    conversations.length === 0 &&
    (connectionsData?.accepted.length ?? 0) === 0;
  const hasResults =
    filteredConversations.length > 0 || availableConnections.length > 0;
  const hasAnyDestination =
    conversations.length > 0 || (connectionsData?.accepted.length ?? 0) > 0;

  return (
    <AlenioBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      compact
      showCloseButton
      bodyHeightRatio={0.62}
      showScrollIndicator
      testID="conversation-picker-screen"
    >
      <View style={styles.searchBar}>
        <Search size={16} color="#94A3B8" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search people and groups"
          placeholderTextColor="#94A3B8"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
          testID="conversation-picker-search"
        />
        {search ? (
          <Pressable
            onPress={() => setSearch("")}
            hitSlop={8}
            accessibilityLabel="Clear search"
            testID="conversation-picker-search-clear"
          >
            <X size={15} color="#8A95A7" />
          </Pressable>
        ) : null}
      </View>

      {createDirectMessage.isError ? (
        <Text style={styles.inlineError}>
          Couldn&apos;t start that conversation. Please try again.
        </Text>
      ) : null}

      <View style={styles.list} testID="conversation-picker-list">
        {isLoading ? (
          <View style={styles.state} testID="conversation-picker-loading">
            <ActivityIndicator color="#4361EE" />
            <Text style={styles.stateBody}>Loading destinations…</Text>
          </View>
        ) : isError ? (
          <View style={styles.state} testID="conversation-picker-error">
            <Text style={styles.stateTitle}>Couldn&apos;t load destinations</Text>
            <Text style={styles.stateBody}>Check your connection and try again.</Text>
            <Pressable
              onPress={() => {
                void refetchConversations();
                void refetchConnections();
              }}
              style={styles.retryButton}
              testID="conversation-picker-retry"
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : hasResults ? (
          <>
            {filteredConversations.length > 0 ? (
              <View>
                <Text style={styles.sectionLabel}>CONVERSATIONS</Text>
                {filteredConversations.map((item) => {
                  const isGroup = item.isGroup || item.type === "GROUP";
                  const other = isGroup
                    ? null
                    : dmOtherParticipant(item, currentUserId);
                  const label = senecaConversationLabel(item, currentUserId);
                  const groupImage = isGroup
                    ? resolveUserImageUrl(item.image)
                    : null;
                  const memberCount = item.participants?.length ?? 0;

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => onSelect(item)}
                      style={styles.row}
                      accessibilityRole="button"
                      accessibilityLabel={`Send image to ${label}`}
                      testID={`conversation-picker-item-${item.id}`}
                    >
                      {isGroup ? (
                        groupImage ? (
                          <Image
                            source={{ uri: groupImage }}
                            style={styles.avatar}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.avatar, styles.groupAvatar]}>
                            <Users size={16} color="#7C3AED" strokeWidth={2.1} />
                          </View>
                        )
                      ) : other ? (
                        <UserAvatar
                          user={other}
                          size={40}
                          radius={20}
                          backgroundColor="#EEF2FF"
                          textColor="#4361EE"
                          fontSize={12}
                        />
                      ) : (
                        <View style={[styles.avatar, styles.directAvatar]}>
                          <MessageCircle
                            size={16}
                            color="#4361EE"
                            strokeWidth={2.1}
                          />
                        </View>
                      )}
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {label}
                        </Text>
                        <Text style={styles.rowSubtitle} numberOfLines={1}>
                          {isGroup
                            ? memberCount > 0
                              ? `Group · ${memberCount} ${memberCount === 1 ? "member" : "members"}`
                              : "Group conversation"
                            : "Direct message"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {availableConnections.length > 0 ? (
              <View
                style={
                  filteredConversations.length > 0
                    ? styles.sectionSpacing
                    : undefined
                }
              >
                <Text style={styles.sectionLabel}>CONNECTIONS</Text>
                {availableConnections.map((connection) => {
                  const name =
                    connection.person.name?.trim() || "Alenio member";
                  const isStarting =
                    createDirectMessage.isPending &&
                    createDirectMessage.variables?.person.id ===
                      connection.person.id;
                  return (
                    <Pressable
                      key={connection.person.id}
                      onPress={() => createDirectMessage.mutate(connection)}
                      disabled={createDirectMessage.isPending}
                      style={[
                        styles.row,
                        createDirectMessage.isPending && !isStarting
                          ? styles.rowDisabled
                          : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Start a direct message and send image to ${name}`}
                      testID={`conversation-picker-connection-${connection.person.id}`}
                    >
                      <UserAvatar
                        user={{
                          ...connection.person,
                          activeNow: connection.activeNow,
                        }}
                        size={40}
                        radius={20}
                        backgroundColor="#EEF2FF"
                        textColor="#4361EE"
                        fontSize={12}
                      />
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.rowSubtitle} numberOfLines={1}>
                          Connection
                        </Text>
                      </View>
                      {isStarting ? (
                        <ActivityIndicator size="small" color="#4361EE" />
                      ) : (
                        <MessageCircle
                          size={15}
                          color="#8EA0BA"
                          strokeWidth={2}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </>
        ) : !hasAnyDestination ? (
          <View style={styles.state} testID="conversation-picker-empty">
            <Text style={styles.stateTitle}>No destinations yet</Text>
            <Text style={styles.stateBody}>
              Connect with someone or create a group to share this image.
            </Text>
          </View>
        ) : (
          <View style={styles.state} testID="conversation-picker-search-empty">
            <Text style={styles.stateTitle}>No matches</Text>
            <Text style={styles.stateBody}>Try another person or group.</Text>
          </View>
        )}
      </View>
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F5F9",
  },
  searchInput: { flex: 1, padding: 0, fontSize: 13, color: "#0F172A" },
  inlineError: {
    marginTop: 8,
    paddingHorizontal: 4,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#B42318",
  },
  list: { marginTop: 8 },
  sectionLabel: {
    paddingHorizontal: 4,
    paddingVertical: 5,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.75,
    color: "#7A869A",
  },
  sectionSpacing: { marginTop: 6 },
  row: {
    minHeight: 58,
    paddingHorizontal: 4,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E9EDF3",
  },
  rowDisabled: { opacity: 0.45 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  groupAvatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F3FF",
  },
  directAvatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: "#172033",
  },
  rowSubtitle: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
    color: "#8A95A7",
  },
  state: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
    paddingVertical: 48,
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
  },
  stateBody: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: "#94A3B8",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 14,
    minHeight: 38,
    paddingHorizontal: 18,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4361EE",
  },
  retryText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
});
