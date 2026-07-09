import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
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
  maxHeight: bottomSheetMenu.listMaxHeight,
  borderTopWidth: 1,
  borderTopColor: "#F1F5F9",
} as const;

type Props = {
  conversationId: string;
  participants: ConversationParticipant[];
  currentUserId: string;
  mode: "add" | "remove" | "transfer" | "admins" | "members" | null;
  onClose: () => void;
};

function roleLabel(role: GroupParticipantRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

function canRemoveParticipant(actorRole: GroupParticipantRole, targetRole: GroupParticipantRole): boolean {
  return actorRole === "owner" && targetRole !== "owner";
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

export function GroupManageModals({ conversationId, participants, currentUserId, mode, onClose }: Props) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<GroupMemberCandidate[]>([]);

  useEffect(() => {
    setSearchQuery("");
    setSelectedUsers([]);
  }, [mode]);

  const myRole = participants.find((p) => p.id === currentUserId)?.role ?? "member";
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

  const removableParticipants = participants.filter(
    (p) => p.id !== currentUserId && canRemoveParticipant(myRole, p.role),
  );

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
    () => filterParticipants(removableParticipants, searchQuery),
    [removableParticipants, searchQuery],
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
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
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
                  searchQuery.trim() ? "No members match your search" : "No removable members",
                  (participant) => (
                    <TouchableOpacity
                      onPress={() => removeMemberMutation.mutate(participant.id)}
                      disabled={removeMemberMutation.isPending}
                      style={[bottomSheetMenu.iconAction, { backgroundColor: "#FEF2F2" }]}
                    >
                      <UserMinus size={16} color="#EF4444" />
                    </TouchableOpacity>
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
                      onPress={() => transferOwnershipMutation.mutate(participant.id)}
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
                        onPress={() => updateRoleMutation.mutate({ userId: participant.id, role: "member" })}
                        disabled={updateRoleMutation.isPending}
                        style={[bottomSheetMenu.iconAction, { backgroundColor: "#FEF3C7" }]}
                      >
                        <Shield size={16} color="#D97706" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => updateRoleMutation.mutate({ userId: participant.id, role: "admin" })}
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
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
