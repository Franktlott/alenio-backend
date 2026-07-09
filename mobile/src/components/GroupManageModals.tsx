import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, Check, UserMinus, Crown, Shield } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import type { ConversationParticipant, GroupMemberCandidate, GroupParticipantRole } from "@/lib/types";
import { resolveUserImageUrl } from "@/lib/user-avatar";

type GroupMembersResponse = {
  participants: ConversationParticipant[];
  myRole: GroupParticipantRole;
};

type Props = {
  conversationId: string;
  participants: ConversationParticipant[];
  currentUserId: string;
  mode: "add" | "remove" | "transfer" | "admins" | null;
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

export function GroupManageModals({ conversationId, participants, currentUserId, mode, onClose }: Props) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<GroupMemberCandidate[]>([]);

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

  const toggleUser = (user: GroupMemberCandidate) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  };

  const title =
    mode === "add"
      ? "Add Members"
      : mode === "remove"
        ? "Remove Members"
        : mode === "transfer"
          ? "Transfer Ownership"
          : mode === "admins"
            ? "Manage Admins"
            : "";

  const subtitle =
    mode === "add"
      ? "Add people from your workspaces"
      : mode === "remove"
        ? "Remove people from this group"
        : mode === "transfer"
          ? "Choose the new group owner"
          : mode === "admins"
            ? "Promote members to admin or demote admins"
            : "";

  const renderMemberRow = (
    participant: ConversationParticipant,
    action?: React.ReactNode,
  ) => {
    const imageUrl = resolveUserImageUrl(participant.image);
    return (
      <View
        key={participant.id}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: "#F1F5F9",
          gap: 12,
        }}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
        ) : (
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#4361EE", fontWeight: "700" }}>{participant.name?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
            {participant.name ?? participant.email ?? "Member"}
          </Text>
          <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>{roleLabel(participant.role)}</Text>
        </View>
        {action}
      </View>
    );
  };

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ backgroundColor: "white", marginHorizontal: 12, marginBottom: 32, borderRadius: 16, overflow: "hidden", maxHeight: "80%" }}>
            <View style={{ paddingVertical: 10, alignItems: "center" }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0" }} />
            </View>
            <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>{title}</Text>
              <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{subtitle}</Text>
            </View>

            {mode === "add" ? (
              <>
                <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
                  <Search size={16} color="#94A3B8" />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search by name or email"
                    placeholderTextColor="#94A3B8"
                    style={{ flex: 1, paddingVertical: 10, fontSize: 15, color: "#0F172A" }}
                  />
                  {searchQuery.length > 0 ? (
                    <TouchableOpacity onPress={() => setSearchQuery("")}>
                      <X size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {candidatesLoading ? (
                  <View style={{ paddingVertical: 24, alignItems: "center" }}>
                    <ActivityIndicator color="#4361EE" />
                  </View>
                ) : (
                  <FlatList
                    data={addCandidates}
                    keyExtractor={(item) => item.id}
                    style={{ maxHeight: 280 }}
                    renderItem={({ item }) => {
                      const selected = selectedUsers.some((u) => u.id === item.id);
                      const imageUrl = resolveUserImageUrl(item.image);
                      return (
                        <TouchableOpacity
                          onPress={() => toggleUser(item)}
                          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}
                        >
                          {imageUrl ? (
                            <Image source={{ uri: imageUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                          ) : (
                            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ color: "#4361EE", fontWeight: "700" }}>{item.name?.[0]?.toUpperCase() ?? "?"}</Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>{item.name ?? item.email}</Text>
                            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 1 }}>{item.workspaceLabel}</Text>
                          </View>
                          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selected ? "#4361EE" : "#CBD5E1", backgroundColor: selected ? "#4361EE" : "transparent", alignItems: "center", justifyContent: "center" }}>
                            {selected ? <Check size={14} color="white" strokeWidth={3} /> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={
                      <Text style={{ textAlign: "center", color: "#94A3B8", paddingVertical: 24 }}>No people to add</Text>
                    }
                  />
                )}
                <TouchableOpacity
                  onPress={() => addMembersMutation.mutate(selectedUsers.map((u) => u.id))}
                  disabled={selectedUsers.length === 0 || addMembersMutation.isPending}
                  style={{ margin: 20, marginTop: 8, backgroundColor: selectedUsers.length === 0 ? "#CBD5E1" : "#4361EE", borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
                >
                  {addMembersMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>
                      Add {selectedUsers.length > 0 ? `${selectedUsers.length} ` : ""}Member{selectedUsers.length === 1 ? "" : "s"}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : null}

            {mode === "remove" ? (
              <View style={{ maxHeight: 360 }}>
                {removableParticipants.map((participant) =>
                  renderMemberRow(
                    participant,
                    <TouchableOpacity
                      onPress={() => removeMemberMutation.mutate(participant.id)}
                      disabled={removeMemberMutation.isPending}
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" }}
                    >
                      <UserMinus size={18} color="#EF4444" />
                    </TouchableOpacity>,
                  ),
                )}
                {removableParticipants.length === 0 ? (
                  <Text style={{ textAlign: "center", color: "#94A3B8", paddingVertical: 24 }}>No removable members</Text>
                ) : null}
              </View>
            ) : null}

            {mode === "transfer" ? (
              <View style={{ maxHeight: 360 }}>
                {transferableParticipants.map((participant) =>
                  renderMemberRow(
                    participant,
                    <TouchableOpacity
                      onPress={() => transferOwnershipMutation.mutate(participant.id)}
                      disabled={transferOwnershipMutation.isPending}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EEF2FF", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }}
                    >
                      <Crown size={14} color="#4361EE" />
                      <Text style={{ color: "#4361EE", fontSize: 13, fontWeight: "700" }}>Make Owner</Text>
                    </TouchableOpacity>,
                  ),
                )}
                {transferableParticipants.length === 0 ? (
                  <Text style={{ textAlign: "center", color: "#94A3B8", paddingVertical: 24 }}>No members available</Text>
                ) : null}
              </View>
            ) : null}

            {mode === "admins" ? (
              <View style={{ maxHeight: 360 }}>
                {adminCandidates.map((participant) =>
                  renderMemberRow(
                    participant,
                    participant.role === "admin" ? (
                      <TouchableOpacity
                        onPress={() => updateRoleMutation.mutate({ userId: participant.id, role: "member" })}
                        disabled={updateRoleMutation.isPending}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF3C7", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }}
                      >
                        <Shield size={14} color="#D97706" />
                        <Text style={{ color: "#D97706", fontSize: 13, fontWeight: "700" }}>Remove Admin</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => updateRoleMutation.mutate({ userId: participant.id, role: "admin" })}
                        disabled={updateRoleMutation.isPending}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EEF2FF", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 }}
                      >
                        <Shield size={14} color="#4361EE" />
                        <Text style={{ color: "#4361EE", fontSize: 13, fontWeight: "700" }}>Make Admin</Text>
                      </TouchableOpacity>
                    ),
                  ),
                )}
                {adminCandidates.length === 0 ? (
                  <Text style={{ textAlign: "center", color: "#94A3B8", paddingVertical: 24 }}>No members available</Text>
                ) : null}
              </View>
            ) : null}

            <TouchableOpacity onPress={onClose} style={{ paddingVertical: 16, alignItems: "center", borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#64748B" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
