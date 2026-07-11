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
import { Check, Smartphone, UserPlus, X } from "lucide-react-native";

export type JoinRequestRow = {
  id: string;
  status: string;
  teamId?: string;
  team: { id: string; name: string; image: string | null };
  user?: { id: string; name: string; email: string; image: string | null };
  createdAt: string;
};

export type GoLoginRequestRow = {
  id: string;
  status: string;
  teamId?: string;
  teamName?: string;
  deviceId: string;
  deviceLabel: string | null;
  createdAt: string;
};

type Props = {
  visible: boolean;
  requests: JoinRequestRow[];
  goLoginRequests?: GoLoginRequestRow[];
  activeTeamId?: string | null;
  busyRequestId: string | null;
  onClose: () => void;
  onApprove: (request: JoinRequestRow) => void;
  onDecline: (request: JoinRequestRow) => void;
  onApproveGo?: (request: GoLoginRequestRow) => void;
  onDeclineGo?: (request: GoLoginRequestRow) => void;
};

function formatRequestDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ActionButtons({
  busy,
  onDecline,
  onApprove,
  testIdPrefix,
}: {
  busy: boolean;
  onDecline: () => void;
  onApprove: () => void;
  testIdPrefix: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Pressable
        onPress={onDecline}
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
        testID={`reject-${testIdPrefix}`}
      >
        <X size={16} color="#64748B" />
      </Pressable>
      <Pressable
        onPress={onApprove}
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
        testID={`approve-${testIdPrefix}`}
      >
        {busy ? <ActivityIndicator size="small" color="white" /> : <Check size={16} color="white" />}
      </Pressable>
    </View>
  );
}

export function PendingJoinRequestsSheet({
  visible,
  requests,
  goLoginRequests = [],
  activeTeamId = null,
  busyRequestId,
  onClose,
  onApprove,
  onDecline,
  onApproveGo,
  onDeclineGo,
}: Props) {
  const insets = useSafeAreaInsets();
  const total = requests.length + goLoginRequests.length;

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
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Pending approvals</Text>
              <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
                {total} {total === 1 ? "item needs" : "items need"} your review
              </Text>
            </View>

            {total === 0 ? (
              <Text style={{ fontSize: 14, color: "#94A3B8", textAlign: "center", paddingVertical: 24 }}>
                No pending requests.
              </Text>
            ) : (
              <ScrollView
                style={{ maxHeight: 420 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                {goLoginRequests.map((req) => {
                  const busy = busyRequestId === req.id;
                  const label = req.deviceLabel?.trim() || "A device";
                  const workspaceLabel =
                    req.teamName && req.teamId && req.teamId !== activeTeamId ? req.teamName : null;
                  return (
                    <View
                      key={`go-${req.id}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: "#F1F5F9",
                      }}
                      testID={`go-login-request-row-${req.id}`}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: "#EEF2FF",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Smartphone size={16} color="#4361EE" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                          {label}
                        </Text>
                        <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }} numberOfLines={2}>
                          {workspaceLabel ? `${workspaceLabel} · ` : ""}
                          Alenio Go access · Requested {formatRequestDate(req.createdAt)}
                        </Text>
                      </View>
                      <ActionButtons
                        busy={busy}
                        testIdPrefix={`go-request-${req.id}`}
                        onDecline={() => onDeclineGo?.(req)}
                        onApprove={() => onApproveGo?.(req)}
                      />
                    </View>
                  );
                })}
                {requests.map((req) => {
                  const busy = busyRequestId === req.id;
                  const name = req.user?.name ?? "Unknown";
                  const email = req.user?.email;
                  const workspaceLabel =
                    req.team?.name && req.team.id !== activeTeamId ? req.team.name : null;
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
                          {workspaceLabel ? `${workspaceLabel} · ` : ""}
                          {email ? `${email} · ` : ""}
                          Requested {formatRequestDate(req.createdAt)}
                        </Text>
                      </View>
                      <ActionButtons
                        busy={busy}
                        testIdPrefix={`request-${req.id}`}
                        onDecline={() => onDecline(req)}
                        onApprove={() => onApprove(req)}
                      />
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

/** Compact tappable chip for the team members header. Always visible for managers. */
export function PendingJoinRequestsChip({
  count,
  onPress,
  alwaysShow = false,
}: {
  count: number;
  onPress: () => void;
  alwaysShow?: boolean;
}) {
  if (!alwaysShow && count <= 0) return null;
  const hasPending = count > 0;
  const label = hasPending ? (count === 1 ? "1 request" : `${count} requests`) : "Requests";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        flexShrink: 0,
        backgroundColor: hasPending
          ? pressed
            ? "#3730A3"
            : "#4338CA"
          : pressed
            ? "#E0E7FF"
            : "#EEF2FF",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: hasPending ? "#3730A3" : "#C7D2FE",
      })}
      testID="pending-join-requests-chip"
      accessibilityRole="button"
      accessibilityLabel={
        hasPending
          ? `${count} pending approval${count !== 1 ? "s" : ""}, tap to review`
          : "Review join requests"
      }
    >
      <UserPlus size={13} color={hasPending ? "#FFFFFF" : "#4338CA"} style={{ marginRight: 4 }} />
      <Text style={{ fontSize: 12, fontWeight: "700", color: hasPending ? "#FFFFFF" : "#4338CA" }}>
        {label}
      </Text>
    </Pressable>
  );
}
