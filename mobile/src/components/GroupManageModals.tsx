import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  type ListRenderItemInfo,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, Check, UserMinus, Crown, Shield } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import type {
  ConversationParticipant,
  GroupMemberCandidate,
  GroupParticipantRole,
} from "@/lib/types";
import {
  AlenioBottomSheet,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";

type GroupMembersResponse = {
  participants: ConversationParticipant[];
  myRole: GroupParticipantRole;
};

/** Scroll only after the list grows past this — short groups hug content. */
const LIST_MAX_HEIGHT = 220;
const ROW_AVATAR = 30;

type Props = {
  conversationId: string;
  participants: ConversationParticipant[];
  currentUserId: string;
  myRole?: GroupParticipantRole;
  mode: "add" | "remove" | "transfer" | "admins" | "members" | null;
  onClose: () => void;
};

function roleLabel(role: GroupParticipantRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

/** Owners can remove admins/members; admins can remove members only. */
function canRemoveParticipant(
  actorRole: GroupParticipantRole,
  targetRole: GroupParticipantRole,
): boolean {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole === "member";
  return false;
}

function filterParticipants(
  participants: ConversationParticipant[],
  query: string,
): ConversationParticipant[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return participants;
  return participants.filter((participant) => {
    const name = (participant.name ?? "").toLowerCase();
    const email = (participant.email ?? "").toLowerCase();
    const role = roleLabel(participant.role).toLowerCase();
    return (
      name.includes(normalized) ||
      email.includes(normalized) ||
      role.includes(normalized)
    );
  });
}

function sheetCopy(mode: Props["mode"], peopleCount: number) {
  switch (mode) {
    case "add":
      return {
        title: "Add members",
        subtitle: "Invite people from your workspaces",
      };
    case "remove":
      return {
        title: "Remove members",
        subtitle: "Remove people from this group",
      };
    case "transfer":
      return {
        title: "Transfer ownership",
        subtitle: "Make someone else the group owner",
      };
    case "admins":
      return {
        title: "Manage admins",
        subtitle: "Grant or revoke admin access",
      };
    case "members":
    default:
      return {
        title: "Members",
        subtitle: `${peopleCount} ${peopleCount === 1 ? "person" : "people"}`,
      };
  }
}

export function GroupManageModals({
  conversationId,
  participants,
  currentUserId,
  myRole: myRoleProp,
  mode,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<GroupMemberCandidate[]>(
    [],
  );

  useEffect(() => {
    setSearchQuery("");
    setSelectedUsers([]);
  }, [mode]);

  const myRole =
    myRoleProp ??
    participants.find((p) => p.id === currentUserId)?.role ??
    "member";
  const existingIds = useMemo(
    () => new Set(participants.map((p) => p.id)),
    [participants],
  );

  const { data: candidates = [], isFetching: candidatesLoading } = useQuery({
    queryKey: ["group-member-candidates", searchQuery],
    queryFn: () =>
      api.get<GroupMemberCandidate[]>(
        `/api/dms/group-member-candidates${
          searchQuery.trim().length >= 2
            ? `?q=${encodeURIComponent(searchQuery.trim())}`
            : ""
        }`,
      ),
    enabled: mode === "add" && !!currentUserId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["dms"] });
    queryClient.invalidateQueries({
      queryKey: ["dm-messages", conversationId],
    });
  };

  const addMembersMutation = useMutation({
    mutationFn: (participantIds: string[]) =>
      api.post<GroupMembersResponse>(`/api/dms/${conversationId}/members`, {
        participantIds,
      }),
    onSuccess: () => {
      invalidate();
      setSelectedUsers([]);
      toast({ title: "Members added", preset: "done" });
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: err.message || "Could not add members", preset: "error" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete<GroupMembersResponse>(
        `/api/dms/${conversationId}/members/${userId}`,
      ),
    onSuccess: () => {
      invalidate();
      toast({ title: "Member removed", preset: "done" });
    },
    onError: (err: Error) =>
      toast({
        title: err.message || "Could not remove member",
        preset: "error",
      }),
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<GroupMembersResponse>(
        `/api/dms/${conversationId}/transfer-ownership`,
        { userId },
      ),
    onSuccess: () => {
      invalidate();
      toast({ title: "Ownership transferred", preset: "done" });
      onClose();
    },
    onError: (err: Error) =>
      toast({
        title: err.message || "Could not transfer ownership",
        preset: "error",
      }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: "admin" | "member";
    }) =>
      api.patch<GroupMembersResponse>(
        `/api/dms/${conversationId}/participants/${userId}/role`,
        { role },
      ),
    onSuccess: () => {
      invalidate();
      toast({ title: "Admin updated", preset: "done" });
    },
    onError: (err: Error) =>
      toast({ title: err.message || "Could not update admin", preset: "error" }),
  });

  const sortedMembers = useMemo(() => {
    return [...participants].sort((a, b) => {
      const rank = (role: GroupParticipantRole) =>
        role === "owner" ? 0 : role === "admin" ? 1 : 2;
      const byRole = rank(a.role) - rank(b.role);
      if (byRole !== 0) return byRole;
      return (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "");
    });
  }, [participants]);

  const filteredSortedMembers = useMemo(
    () => filterParticipants(sortedMembers, searchQuery),
    [sortedMembers, searchQuery],
  );

  const removeListParticipants = useMemo(
    () => participants.filter((p) => p.id !== currentUserId),
    [participants, currentUserId],
  );
  const filteredRemovableParticipants = useMemo(
    () => filterParticipants(removeListParticipants, searchQuery),
    [removeListParticipants, searchQuery],
  );

  const transferableParticipants = useMemo(
    () =>
      participants.filter(
        (p) => p.id !== currentUserId && p.role !== "owner",
      ),
    [participants, currentUserId],
  );
  const filteredTransferableParticipants = useMemo(
    () => filterParticipants(transferableParticipants, searchQuery),
    [transferableParticipants, searchQuery],
  );

  const adminCandidates = useMemo(
    () =>
      participants.filter(
        (p) => p.id !== currentUserId && p.role !== "owner",
      ),
    [participants, currentUserId],
  );
  const filteredAdminCandidates = useMemo(
    () => filterParticipants(adminCandidates, searchQuery),
    [adminCandidates, searchQuery],
  );

  const addCandidates = useMemo(
    () =>
      candidates.filter(
        (c) => !existingIds.has(c.id) && c.id !== currentUserId,
      ),
    [candidates, existingIds, currentUserId],
  );

  const toggleUser = (user: GroupMemberCandidate) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const confirmRemoveMember = (participant: ConversationParticipant) => {
    const name = participant.name ?? participant.email ?? "this member";
    Alert.alert(`Remove ${name}?`, "They will lose access to this group.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeMemberMutation.mutate(participant.id),
      },
    ]);
  };

  const confirmTransferOwnership = (participant: ConversationParticipant) => {
    const name = participant.name ?? participant.email ?? "this member";
    Alert.alert(
      `Transfer ownership to ${name}?`,
      "You will become an admin. Only the new owner can delete the group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: () => transferOwnershipMutation.mutate(participant.id),
        },
      ],
    );
  };

  const confirmAdminChange = (
    participant: ConversationParticipant,
    nextRole: "admin" | "member",
  ) => {
    const name = participant.name ?? participant.email ?? "this member";
    if (nextRole === "admin") {
      Alert.alert(
        `Make ${name} an admin?`,
        "They will be able to add and remove members and update group details.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Make admin",
            onPress: () =>
              updateRoleMutation.mutate({
                userId: participant.id,
                role: "admin",
              }),
          },
        ],
      );
      return;
    }
    Alert.alert(
      `Remove admin from ${name}?`,
      "They will stay in the group as a member.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove admin",
          style: "destructive",
          onPress: () =>
            updateRoleMutation.mutate({
              userId: participant.id,
              role: "member",
            }),
        },
      ],
    );
  };

  const copy = sheetCopy(mode, participants.length);

  const renderSearchBar = (placeholder: string) => (
    <View style={styles.searchWrap}>
      <Search size={13} color="#94A3B8" strokeWidth={2.2} />
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={styles.searchInput}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {searchQuery.length > 0 ? (
        <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
          <X size={13} color="#94A3B8" />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderMemberRow = (
    participant: ConversationParticipant,
    action?: React.ReactNode,
  ) => (
    <View style={styles.listRow}>
      <UserAvatar
        user={participant}
        size={ROW_AVATAR}
        radius={ROW_AVATAR / 2}
        backgroundColor="#EEF2FF"
        textColor="#4361EE"
        fontSize={11}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.memberName} numberOfLines={1}>
          {participant.name ?? participant.email ?? "Member"}
        </Text>
        <Text style={styles.memberMeta}>{roleLabel(participant.role)}</Text>
      </View>
      {action}
    </View>
  );

  const renderParticipantList = (
    data: ConversationParticipant[],
    emptyText: string,
    renderAction: (
      participant: ConversationParticipant,
    ) => React.ReactNode | undefined,
    withSearch = false,
    searchPlaceholder = "Search members",
  ) => (
    <>
      {withSearch ? renderSearchBar(searchPlaceholder) : null}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        style={styles.list}
        nestedScrollEnabled
        showsVerticalScrollIndicator={data.length > 5}
        keyboardShouldPersistTaps="handled"
        bounces={data.length > 5}
        renderItem={({ item }: ListRenderItemInfo<ConversationParticipant>) =>
          renderMemberRow(item, renderAction(item))
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>{emptyText}</Text>
        }
      />
    </>
  );

  return (
    <AlenioBottomSheet
      visible={mode !== null}
      title={copy.title}
      subtitle={copy.subtitle}
      onClose={onClose}
      compact
      scrollEnabled={false}
      testID="group-manage-sheet"
      footer={
        mode === "add" ? (
          <View style={styles.addFooter}>
            <TouchableOpacity
              onPress={() =>
                addMembersMutation.mutate(selectedUsers.map((u) => u.id))
              }
              disabled={
                selectedUsers.length === 0 || addMembersMutation.isPending
              }
              style={[
                alenioSheetStyles.primaryButton,
                {
                  backgroundColor:
                    selectedUsers.length === 0 ? "#CBD5E1" : "#4361EE",
                },
              ]}
            >
              {addMembersMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  Add{" "}
                  {selectedUsers.length > 0 ? `${selectedUsers.length} ` : ""}
                  Member{selectedUsers.length === 1 ? "" : "s"}
                </Text>
              )}
            </TouchableOpacity>
            <Pressable onPress={onClose} style={alenioSheetStyles.cancelButton}>
              <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={onClose} style={alenioSheetStyles.cancelButton}>
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        )
      }
    >
      {mode === "add" ? (
        <>
          {renderSearchBar("Search by name or email")}
          {candidatesLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color="#4361EE" />
            </View>
          ) : (
            <FlatList
              data={addCandidates}
              keyExtractor={(item) => item.id}
              style={styles.list}
              nestedScrollEnabled
              showsVerticalScrollIndicator={addCandidates.length > 5}
              keyboardShouldPersistTaps="handled"
              bounces={addCandidates.length > 5}
              renderItem={({ item }) => {
                const selected = selectedUsers.some((u) => u.id === item.id);
                return (
                  <TouchableOpacity
                    onPress={() => toggleUser(item)}
                    style={styles.listRow}
                  >
                    <UserAvatar
                      user={item}
                      size={ROW_AVATAR}
                      radius={ROW_AVATAR / 2}
                      backgroundColor="#EEF2FF"
                      textColor="#4361EE"
                      fontSize={11}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {item.name ?? item.email}
                      </Text>
                      <Text style={styles.memberMeta} numberOfLines={1}>
                        {item.workspaceLabel}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.check,
                        selected ? styles.checkSelected : null,
                      ]}
                    >
                      {selected ? (
                        <Check size={12} color="white" strokeWidth={3} />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No people to add</Text>
              }
            />
          )}
        </>
      ) : null}

      {mode === "members"
        ? renderParticipantList(
            filteredSortedMembers,
            searchQuery.trim()
              ? "No members match your search"
              : "No members yet",
            (participant) =>
              participant.id === currentUserId ? (
                <Text style={styles.youLabel}>You</Text>
              ) : undefined,
            true,
            "Search members",
          )
        : null}

      {mode === "remove"
        ? renderParticipantList(
            filteredRemovableParticipants,
            searchQuery.trim()
              ? "No members match your search"
              : removeListParticipants.length === 0
                ? "You're the only member"
                : "No removable members",
            (participant) =>
              canRemoveParticipant(myRole, participant.role) ? (
                <TouchableOpacity
                  onPress={() => confirmRemoveMember(participant)}
                  disabled={removeMemberMutation.isPending}
                  style={[styles.iconAction, { backgroundColor: "#FEF2F2" }]}
                >
                  <UserMinus size={14} color="#EF4444" />
                </TouchableOpacity>
              ) : (
                <Text style={styles.youLabel}>
                  {participant.role === "owner" ? "Owner" : "Can't remove"}
                </Text>
              ),
            true,
            "Search members",
          )
        : null}

      {mode === "transfer"
        ? renderParticipantList(
            filteredTransferableParticipants,
            searchQuery.trim()
              ? "No members match your search"
              : "No members available",
            (participant) => (
              <TouchableOpacity
                onPress={() => confirmTransferOwnership(participant)}
                disabled={transferOwnershipMutation.isPending}
                style={[styles.iconAction, { backgroundColor: "#EEF2FF" }]}
              >
                <Crown size={14} color="#4361EE" />
              </TouchableOpacity>
            ),
            true,
            "Search members",
          )
        : null}

      {mode === "admins"
        ? renderParticipantList(
            filteredAdminCandidates,
            searchQuery.trim()
              ? "No members match your search"
              : "No members available",
            (participant) =>
              participant.role === "admin" ? (
                <TouchableOpacity
                  onPress={() => confirmAdminChange(participant, "member")}
                  disabled={updateRoleMutation.isPending}
                  style={[styles.iconAction, { backgroundColor: "#FEF3C7" }]}
                >
                  <Shield size={14} color="#D97706" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => confirmAdminChange(participant, "admin")}
                  disabled={updateRoleMutation.isPending}
                  style={[styles.iconAction, { backgroundColor: "#EEF2FF" }]}
                >
                  <Shield size={14} color="#4361EE" />
                </TouchableOpacity>
              ),
            true,
            "Search members",
          )
        : null}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8EDF3",
    paddingHorizontal: 9,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 13,
    color: "#0F172A",
  },
  list: {
    maxHeight: LIST_MAX_HEIGHT,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F2F4F7",
  },
  memberName: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: "#20283C",
  },
  memberMeta: {
    fontSize: 10,
    lineHeight: 13,
    color: "#94A3B8",
    marginTop: 0,
  },
  youLabel: {
    fontSize: 11,
    color: "#94A3B8",
  },
  emptyText: {
    textAlign: "center",
    color: "#94A3B8",
    paddingVertical: 12,
    fontSize: 12,
  },
  loading: {
    paddingVertical: 12,
    alignItems: "center",
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  checkSelected: {
    borderColor: "#4361EE",
    backgroundColor: "#4361EE",
  },
  iconAction: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addFooter: {
    width: "100%",
    gap: 6,
  },
});
