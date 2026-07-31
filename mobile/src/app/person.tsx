import React, { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Building2,
  Check,
  Clock,
  MessageSquare,
  MoreVertical,
  UserMinus,
  UserPlus,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { resolveUserImageUrl } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import type { ConnectionStatus } from "@/lib/types";

type PersonProfile = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  sharedWorkspaces: { id: string; name: string }[];
  connectionStatus: ConnectionStatus;
  isBlockedByMe: boolean;
  canMessage: boolean;
  isSelf: boolean;
};

const BRAND = "#4361EE";

export default function PersonScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === "string" ? params.userId : "";
  const [menuOpen, setMenuOpen] = useState(false);

  const personKey = ["person", userId] as const;

  const { data: person, isLoading } = useQuery({
    queryKey: personKey,
    queryFn: () => api.get<PersonProfile>(`/api/connections/person/${encodeURIComponent(userId)}`),
    enabled: userId.length > 0,
  });

  const refreshPerson = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: personKey }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
      queryClient.invalidateQueries({ queryKey: ["user-search"] }),
    ]);
  };

  const connectionAction = useMutation({
    mutationFn: (action: "request" | "accept" | "decline" | "remove" | "block") => {
      if (action === "remove") return api.delete("/api/connections", { userId });
      if (action === "block") return api.post("/api/connections/block", { userId });
      return api.post(`/api/connections/${action}`, { userId });
    },
    onSuccess: refreshPerson,
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Something went wrong",
        preset: "error",
      });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: () => api.delete("/api/connections/block", { userId }),
    onSuccess: refreshPerson,
    onError: () => toast({ title: "Could not unblock", preset: "error" }),
  });

  const messageMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string; recipient: { name: string; image?: string | null } | null }>(
        "/api/dms/find-or-create",
        { recipientId: userId },
      ),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      router.push({
        pathname: "/dm-chat",
        params: {
          conversationId: conv.id,
          recipientName: conv.recipient?.name ?? person?.name ?? "Direct Message",
          recipientImage: resolveUserImageUrl(conv.recipient?.image) ?? "",
          isGroup: "false",
        },
      });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Couldn't start conversation",
        preset: "error",
      });
    },
  });

  const confirmDestructive = (action: "remove" | "block", title: string, message: string) => {
    setMenuOpen(false);
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: action === "block" ? "Block" : "Remove",
        style: "destructive",
        onPress: () => connectionAction.mutate(action),
      },
    ]);
  };

  const busy = connectionAction.isPending || messageMutation.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: "#F6F7FB" }} testID="person-screen">
      <View
        style={{
          paddingTop: insets.top + 4,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#E2E8F0",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: -6 }}
          testID="person-back-button"
        >
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2.25} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", letterSpacing: -0.2 }}>
          Profile
        </Text>
        {person && !person.isSelf ? (
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", marginRight: -6 }}
            testID="person-menu-button"
          >
            <MoreVertical size={20} color="#0F172A" strokeWidth={2.25} />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : !person ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#64748B", textAlign: "center" }}>
            This person is not available
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: insets.bottom + 24 }}
        >
          <View style={{ alignItems: "center" }}>
            <UserAvatar
              user={{ name: person.name, image: person.image }}
              size={92}
              radius={46}
              backgroundColor="#6366F1"
              textColor="#FFFFFF"
              fontSize={30}
            />
            <Text
              style={{
                marginTop: 12,
                fontSize: 20,
                fontWeight: "700",
                color: "#172033",
                letterSpacing: -0.3,
              }}
              numberOfLines={1}
            >
              {person.name ?? "Alenio member"}
            </Text>
            {person.username ? (
              <Text style={{ marginTop: 2, fontSize: 13, color: "#7A869A" }} testID="person-username">
                @{person.username}
              </Text>
            ) : null}

            {person.sharedWorkspaces.length > 0 ? (
              <View
                style={{
                  marginTop: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  backgroundColor: "#EEF2FF",
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Building2 size={11} color="#4361EE" strokeWidth={2.25} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#4361EE" }} numberOfLines={1}>
                  {person.sharedWorkspaces.length === 1
                    ? person.sharedWorkspaces[0]!.name
                    : `${person.sharedWorkspaces.length} shared workspaces`}
                </Text>
              </View>
            ) : null}
          </View>

          {person.isSelf ? null : (
            <View style={{ marginTop: 24, gap: 10 }}>
              <ConnectionButton
                status={person.connectionStatus}
                isBlockedByMe={person.isBlockedByMe}
                busy={busy}
                onRequest={() => connectionAction.mutate("request")}
                onAccept={() => connectionAction.mutate("accept")}
                onDecline={() => connectionAction.mutate("decline")}
                onCancel={() => connectionAction.mutate("remove")}
              />

              {/* A stranger sees Connect alone; Message appears once messaging is permitted. */}
              {person.canMessage ? (
                <Pressable
                  onPress={() => messageMutation.mutate()}
                  disabled={busy}
                  style={{
                    height: 48,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                    backgroundColor: "#FFFFFF",
                    borderWidth: 1,
                    borderColor: "#DDE4FF",
                  }}
                  testID="person-message-button"
                >
                  <MessageSquare size={16} color={BRAND} strokeWidth={2.25} />
                  <Text style={{ fontSize: 15, fontWeight: "700", color: BRAND }}>Message</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.35)", justifyContent: "flex-end" }}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 10,
              paddingBottom: insets.bottom + 12,
            }}
          >
            {person?.connectionStatus === "connected" ? (
              <MenuRow
                icon={UserMinus}
                label="Remove connection"
                onPress={() =>
                  confirmDestructive(
                    "remove",
                    "Remove connection",
                    `${person.name ?? "This person"} will no longer be one of your connections.`,
                  )
                }
                testID="person-remove-connection"
              />
            ) : null}
            {person?.isBlockedByMe ? (
              <MenuRow
                icon={Ban}
                label="Unblock"
                onPress={() => {
                  setMenuOpen(false);
                  unblockMutation.mutate();
                }}
                testID="person-unblock"
              />
            ) : (
              <MenuRow
                icon={Ban}
                label="Block"
                destructive
                onPress={() =>
                  confirmDestructive(
                    "block",
                    "Block this person",
                    "They will not be able to message you or send you a connection request. This does not change any workspace you share.",
                  )
                }
                testID="person-block"
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onPress,
  destructive,
  testID,
}: {
  icon: typeof UserMinus;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 15 }}
      testID={testID}
    >
      <Icon size={18} color={destructive ? "#DC2626" : "#334155"} strokeWidth={2.25} />
      <Text style={{ fontSize: 15, fontWeight: "600", color: destructive ? "#DC2626" : "#0F172A" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ConnectionButton({
  status,
  isBlockedByMe,
  busy,
  onRequest,
  onAccept,
  onDecline,
  onCancel,
}: {
  status: ConnectionStatus;
  isBlockedByMe: boolean;
  busy: boolean;
  onRequest: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  if (isBlockedByMe) {
    return (
      <View
        style={{
          height: 48,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FEF2F2",
          borderWidth: 1,
          borderColor: "#FECACA",
        }}
        testID="person-blocked-state"
      >
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#DC2626" }}>Blocked</Text>
      </View>
    );
  }

  if (status === "pending_incoming") {
    return (
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onAccept}
          disabled={busy}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            backgroundColor: BRAND,
          }}
          testID="person-accept-button"
        >
          <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>Accept</Text>
        </Pressable>
        <Pressable
          onPress={onDecline}
          disabled={busy}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#E2E8F0",
          }}
          testID="person-decline-button"
        >
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#475569" }}>Decline</Text>
        </Pressable>
      </View>
    );
  }

  if (status === "pending_outgoing") {
    return (
      <Pressable
        onPress={onCancel}
        disabled={busy}
        style={{
          height: 48,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "#E2E8F0",
        }}
        testID="person-cancel-request-button"
      >
        <Clock size={16} color="#64748B" strokeWidth={2.25} />
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#475569" }}>Requested</Text>
      </Pressable>
    );
  }

  if (status === "connected") {
    return (
      <View
        style={{
          height: 48,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          backgroundColor: "#ECFDF5",
          borderWidth: 1,
          borderColor: "#A7F3D0",
        }}
        testID="person-connected-state"
      >
        <Check size={16} color="#059669" strokeWidth={2.5} />
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#059669" }}>Connected</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onRequest}
      disabled={busy}
      style={{
        height: 48,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        backgroundColor: BRAND,
      }}
      testID="person-connect-button"
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <>
          <UserPlus size={16} color="#FFFFFF" strokeWidth={2.25} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFFFFF" }}>Connect</Text>
        </>
      )}
    </Pressable>
  );
}
