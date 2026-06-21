import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, UserPlus, X } from "lucide-react-native";

export type JoinRequestRow = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
  user?: { id: string; name: string; email: string; image: string | null };
  createdAt: string;
};

type Props = {
  visible: boolean;
  requests: JoinRequestRow[];
  busyRequestId: string | null;
  onClose: () => void;
  onApprove: (request: JoinRequestRow) => void;
  onDecline: (request: JoinRequestRow) => void;
};

function formatRequestDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PendingJoinRequestsSheet({
  visible,
  requests,
  busyRequestId,
  onClose,
  onApprove,
  onDecline,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation?.()} style={{ maxHeight: "78%" }}>
          <View
            style={{
              backgroundColor: "white",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center" }} />
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Join requests</Text>
              <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
                {requests.length} {requests.length === 1 ? "person wants" : "people want"} to join your team
              </Text>
            </View>

            {requests.length === 0 ? (
              <Text style={{ fontSize: 14, color: "#94A3B8", textAlign: "center", paddingVertical: 24 }}>
                No pending requests.
              </Text>
            ) : (
              <ScrollView
                style={{ maxHeight: 420 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                {requests.map((req) => {
                  const busy = busyRequestId === req.id;
                  const name = req.user?.name ?? "Unknown";
                  const email = req.user?.email;
                  return (
                    <View
                      key={req.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: "#F1F5F9",
                      }}
                      testID={`join-request-row-${req.id}`}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: "#EEF2FF",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {req.user?.image ? (
                          <Image source={{ uri: req.user.image }} style={{ width: 36, height: 36 }} resizeMode="cover" />
                        ) : (
                          <Text style={{ fontSize: 14, fontWeight: "800", color: "#4361EE" }}>
                            {name[0]?.toUpperCase() ?? "?"}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }} numberOfLines={1}>
                          {email ? `${email} · ` : ""}Requested {formatRequestDate(req.createdAt)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Pressable
                          onPress={() => onDecline(req)}
                          disabled={busy}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            backgroundColor: "#F8FAFC",
                            borderWidth: 1,
                            borderColor: "#E2E8F0",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: busy ? 0.5 : 1,
                          }}
                          testID={`reject-request-${req.id}`}
                          accessibilityLabel={`Decline ${name}`}
                        >
                          <X size={16} color="#64748B" />
                        </Pressable>
                        <Pressable
                          onPress={() => onApprove(req)}
                          disabled={busy}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            backgroundColor: "#4361EE",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: busy ? 0.5 : 1,
                          }}
                          testID={`approve-request-${req.id}`}
                          accessibilityLabel={`Approve ${name}`}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <Check size={16} color="white" />
                          )}
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Compact tappable chip for the team members header. */
export function PendingJoinRequestsChip({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  if (count <= 0) return null;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: "#EEF2FF",
        borderWidth: 1,
        borderColor: "#C7D2FE",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
      }}
      testID="pending-join-requests-chip"
      accessibilityLabel={`${count} join request${count !== 1 ? "s" : ""}, tap to review`}
    >
      <UserPlus size={14} color="#4361EE" />
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#4361EE" }}>{count} requests</Text>
    </Pressable>
  );
}
