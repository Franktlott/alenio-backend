import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
  type ListRenderItemInfo,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, Check, UserMinus, Crown, Shield } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import type { ConversationParticipant, GroupMemberCandidate, GroupParticipantRole } from "@/lib/types";
import { resolveUserImageUrl } from "@/lib/user-avatar";
import { bottomSheetMenu, bottomSheetSectionLabel } from "@/lib/bottom-sheet-menu-styles";

type GroupMembersResponse = {
  participants: ConversationParticipant[];
  myRole: GroupParticipantRole;
};

const memberListStyle = {
  // Fixed height so FlatList scrolls instead of growing and getting clipped by the sheet.
  height: bottomSheetMenu.listMaxHeight,
  borderTopWidth: 1,
  borderTopColor: "#F1F5F9",
} as const;

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
function canRemoveParticipant(actorRole: GroupParticipantRole, targetRole: GroupParticipantRole): boolean {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole === "member";
  return false;
}

function filterParticipants(participants: ConversationParticipant[], query: string): ConversationParticipant[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return participants;
  return participants.filter((participant) => {
    const name = (participant.name ?? "").toLowerCase();
    const email = (participant.email ?? "").toLowerCase();
    const role = roleLabel(participant.role).toLowerCase();
    return name.includes(normalized) || email.includes(normalized) || role.includes(normalized);
  });
}

export function GroupManageModals({ conversationId, participants, currentUserId, myRole: myRoleProp, mode, onClose }: Props) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<GroupMemberCandidate[]>([]);

  useEffect(() => {
    setSearchQuery("");
    setSelectedUsers([]);
  }, [mode]);

  const myRole =
    myRoleProp ?? participants.find((p) => p.id === currentUserId)?.role ?? "member";
  const existingIds = useMemo(() => new Set(participants.map((p) => p.id)), [participants]);

  const { data: candidates = [], isFetching: candidatesLoading } = useQuery({
    queryKey: ["group-member-candidates", searchQuery],
    queryFn: () =>
      api.get<GroupMemberCandidate[]>(
        `/api/dms/group-member-candidates${searchQuery.trim().length >= 2 ? `?q=${encodeURIComponent(searchQuery.trim())}` : ""}`,
      ),
    enabled: mode === "add" && !!currentUserId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["dms"] });
    queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
  };

  const addMembersMutation = useMutation({
    mutationFn: (participantIds: string[]) =>
      api.post<GroupMembersResponse>(`/api/dms/${conversationId}/members`, { participantIds }),
    onSuccess: () => {
      invalidate();
      setSelectedUsers([]);
      toast({ title: "Members added", preset: "done" });
      onClose();
    },
    onError: (err: Error) => toast({ title: err.message || "Could not add members", preset: "error" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete<GroupMembersResponse>(`/api/dms/${conversationId}/members/${userId}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Member removed", preset: "done" });
    },
    onError: (err: Error) => toast({ title: err.message || "Could not remove member", preset: "error" }),
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<GroupMembersResponse>(`/api/dms/${conversationId}/transfer-ownership`, { userId }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Ownership transferred", preset: "done" });
      onClose();
    },
    onError: (err: Error) => toast({ title: err.message || "Could not transfer ownership", preset: "error" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "member" }) =>
      api.patch<GroupMembersResponse>(`/api/dms/${conversationId}/participants/${userId}/role`, { role }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Admin updated", preset: "done" });
    },
    onError: (err: Error) => toast({ title: err.message || "Could not update admin", preset: "error" }),
  });

  const addCandidates = useMemo(
    () => candidates.filter((user) => !existingIds.has(user.id) && user.id !== currentUserId),
    [candidates, currentUserId, existingIds],
  );

  // Show everyone else in Remove mode so the sheet isn't blank when permissions block removal.
  const removeListParticipants = participants.filter((p) => p.id !== currentUserId);

  const transferableParticipants = participants.filter(
    (p) => p.id !== currentUserId && p.role !== "owner",
  );

  const adminCandidates = participants.filter((p) => p.id !== currentUserId && p.role !== "owner");

  const sortedMembers = useMemo(() => {
    const roleOrder: Record<GroupParticipantRole, number> = { owner: 0, admin: 1, member: 2 };
    return [...participants].sort((a, b) => {
      const roleDiff = roleOrder[a.role] - roleOrder[b.role];
      if (roleDiff !== 0) return roleDiff;
      return (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "");
    });
  }, [participants]);

  const filteredSortedMembers = useMemo(
    () => filterParticipants(sortedMembers, searchQuery),
    [sortedMembers, searchQuery],
  );
  const filteredRemovableParticipants = useMemo(
    () => filterParticipants(removeListParticipants, searchQuery),
    [removeListParticipants, searchQuery],
  );
  const filteredTransferableParticipants = useMemo(
    () => filterParticipants(transferableParticipants, searchQuery),
    [transferableParticipants, searchQuery],
  );
  const filteredAdminCandidates = useMemo(
    () => filterParticipants(adminCandidates, searchQuery),
    [adminCandidates, searchQuery],
  );


  const toggleUser = (user: GroupMemberCandidate) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  };

  const participantDisplayName = (participant: ConversationParticipant) =>
    participant.name?.trim() || participant.email?.trim() || "this member";

  const confirmRemoveMember = (participant: ConversationParticipant) => {
    const name = participantDisplayName(participant);
    Alert.alert("Remove member?", `Remove ${name} from this group? They will lose access to the conversation.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeMemberMutation.mutate(participant.id),
      },
    ]);
  };

  const confirmTransferOwnership = (participant: ConversationParticipant) => {
    const name = participantDisplayName(participant);
    Alert.alert(
      "Transfer ownership?",
      `Make ${name} the owner of this group? You will become a regular member and lose owner permissions.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          style: "destructive",
          onPress: () => transferOwnershipMutation.mutate(participant.id),
        },
      ],
    );
  };

  const confirmAdminChange = (participant: ConversationParticipant, nextRole: "admin" | "member") => {
    const name = participantDisplayName(participant);
    if (nextRole === "admin") {
      Alert.alert(
        "Make admin?",
        `Grant admin access to ${name}? They will be able to add and remove members and update group details.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Make Admin",
            onPress: () => updateRoleMutation.mutate({ userId: participant.id, role: "admin" }),
          },
        ],
      );
      return;
    }
    Alert.alert(
      "Remove admin?",
      `Remove admin access from ${name}? They will become a regular member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Admin",
          style: "destructive",
          onPress: () => updateRoleMutation.mutate({ userId: participant.id, role: "member" }),
        },
      ],
    );
  };

  const sectionMeta =
    mode === "members"
      ? `${participants.length} ${participants.length === 1 ? "person" : "people"}`
      : mode === "add"
        ? "from your workspaces"
        : undefined;

  const renderSearchBar = (placeholder: string) => (
    <View style={bottomSheetMenu.searchWrap}>
      <Search size={15} color="#94A3B8" />
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={bottomSheetMenu.searchInput}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {searchQuery.length > 0 ? (
        <TouchableOpacity onPress={() => setSearchQuery("")}>
          <X size={15} color="#94A3B8" />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderMemberRow = (
    participant: ConversationParticipant,
    action?: React.ReactNode,
  ) => {
    const imageUrl = resolveUserImageUrl(participant.image);
    return (
      <View style={bottomSheetMenu.listRow}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={bottomSheetMenu.avatar} />
        ) : (
          <View style={bottomSheetMenu.avatarFallback}>
            <Text style={{ color: "#4361EE", fontWeight: "700", fontSize: 13 }}>{participant.name?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={bottomSheetMenu.memberName} numberOfLines={1}>
            {participant.name ?? participant.email ?? "Member"}
          </Text>
          <Text style={bottomSheetMenu.memberMeta}>{roleLabel(participant.role)}</Text>
        </View>
        {action}
      </View>
    );
  };

  const renderParticipantList = (
    data: ConversationParticipant[],
    emptyText: string,
    renderAction: (participant: ConversationParticipant) => React.ReactNode | undefined,
    withSearch = false,
    searchPlaceholder = "Search members",
  ) => (
    <>
      {withSearch ? renderSearchBar(searchPlaceholder) : null}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        style={withSearch ? { ...memberListStyle, borderTopWidth: 0 } : memberListStyle}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        bounces
        renderItem={({ item }: ListRenderItemInfo<ConversationParticipant>) =>
          renderMemberRow(item, renderAction(item))
        }
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: "#94A3B8", paddingVertical: 16, fontSize: 13 }}>{emptyText}</Text>
        }
      />
    </>
  );

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} />
        <View style={bottomSheetMenu.sheet}>
          <View style={bottomSheetMenu.handleWrap}>
            <View style={bottomSheetMenu.handle} />
          </View>
          <Text style={bottomSheetMenu.sectionLabel}>
            {bottomSheetSectionLabel(
              mode === "add"
                ? "Add Members"
                : mode === "remove"
                  ? "Remove Members"
                  : mode === "transfer"
                    ? "Transfer Ownership"
                    : mode === "admins"
                      ? "Manage Admins"
                      : "Members",
              sectionMeta,
            )}
          </Text>

          {mode === "add" ? (
            <>
              {renderSearchBar("Search by name or email")}
              {candidatesLoading ? (
                <View style={{ paddingVertical: 16, alignItems: "center" }}>
                  <ActivityIndicator color="#4361EE" />
                </View>
              ) : (
                <FlatList
                  data={addCandidates}
                  keyExtractor={(item) => item.id}
                  style={{ ...memberListStyle, borderTopWidth: 0 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  bounces
                  renderItem={({ item }) => {
                    const selected = selectedUsers.some((u) => u.id === item.id);
                    const imageUrl = resolveUserImageUrl(item.image);
                    return (
                      <TouchableOpacity onPress={() => toggleUser(item)} style={bottomSheetMenu.listRow}>
                        {imageUrl ? (
                          <Image source={{ uri: imageUrl }} style={bottomSheetMenu.avatar} />
                        ) : (
                          <View style={bottomSheetMenu.avatarFallback}>
                            <Text style={{ color: "#4361EE", fontWeight: "700", fontSize: 13 }}>{item.name?.[0]?.toUpperCase() ?? "?"}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={bottomSheetMenu.memberName} numberOfLines={1}>{item.name ?? item.email}</Text>
                          <Text style={bottomSheetMenu.memberMeta} numberOfLines={1}>{item.workspaceLabel}</Text>
                        </View>
                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? "#4361EE" : "#CBD5E1", backgroundColor: selected ? "#4361EE" : "transparent", alignItems: "center", justifyContent: "center" }}>
                          {selected ? <Check size={12} color="white" strokeWidth={3} /> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <Text style={{ textAlign: "center", color: "#94A3B8", paddingVertical: 16, fontSize: 13 }}>No people to add</Text>
                  }
                />
              )}
              <TouchableOpacity
                onPress={() => addMembersMutation.mutate(selectedUsers.map((u) => u.id))}
                disabled={selectedUsers.length === 0 || addMembersMutation.isPending}
                style={[bottomSheetMenu.primaryButton, { backgroundColor: selectedUsers.length === 0 ? "#CBD5E1" : "#4361EE" }]}
              >
                {addMembersMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={bottomSheetMenu.primaryButtonText}>
                    Add {selectedUsers.length > 0 ? `${selectedUsers.length} ` : ""}Member{selectedUsers.length === 1 ? "" : "s"}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          {mode === "members"
            ? renderParticipantList(
                filteredSortedMembers,
                searchQuery.trim() ? "No members match your search" : "No members yet",
                (participant) =>
                  participant.id === currentUserId ? (
                    <Text style={bottomSheetMenu.rowMeta}>You</Text>
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
                      style={[bottomSheetMenu.iconAction, { backgroundColor: "#FEF2F2" }]}
                    >
                      <UserMinus size={16} color="#EF4444" />
                    </TouchableOpacity>
                  ) : (
                    <Text style={bottomSheetMenu.rowMeta}>
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
                searchQuery.trim() ? "No members match your search" : "No members available",
                (participant) => (
                  <TouchableOpacity
                    onPress={() => confirmTransferOwnership(participant)}
                    disabled={transferOwnershipMutation.isPending}
                    style={[bottomSheetMenu.iconAction, { backgroundColor: "#EEF2FF" }]}
                  >
                    <Crown size={16} color="#4361EE" />
                  </TouchableOpacity>
                ),
                true,
                "Search members",
              )
            : null}

          {mode === "admins"
            ? renderParticipantList(
                filteredAdminCandidates,
                searchQuery.trim() ? "No members match your search" : "No members available",
                (participant) =>
                  participant.role === "admin" ? (
                    <TouchableOpacity
                      onPress={() => confirmAdminChange(participant, "member")}
                      disabled={updateRoleMutation.isPending}
                      style={[bottomSheetMenu.iconAction, { backgroundColor: "#FEF3C7" }]}
                    >
                      <Shield size={16} color="#D97706" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => confirmAdminChange(participant, "admin")}
                      disabled={updateRoleMutation.isPending}
                      style={[bottomSheetMenu.iconAction, { backgroundColor: "#EEF2FF" }]}
                    >
                      <Shield size={16} color="#4361EE" />
                    </TouchableOpacity>
                  ),
                true,
                "Search members",
              )
            : null}

          <TouchableOpacity onPress={onClose} style={bottomSheetMenu.footer}>
            <Text style={bottomSheetMenu.footerText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
