import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mail, RotateCw, X } from "lucide-react-native";
import type { TeamInvite } from "@/lib/team-invites-api";

type Props = {
  visible: boolean;
  invites: TeamInvite[];
  busyInviteId: string | null;
  onClose: () => void;
  onCancel: (invite: TeamInvite) => void;
  onResend: (invite: TeamInvite) => void;
};

function inviteInitial(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (local[0] ?? "?").toUpperCase();
}

function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatInviteExpiry(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Expired";
  if (days === 1) return "Expires tomorrow";
  return `${days}d left`;
}

const MAX_VISIBLE_INVITES = 3;
/** Approximate row height (avatar + two text lines + vertical padding). */
const INVITE_ROW_HEIGHT = 58;

export function PendingInvitesSheet({
  visible,
  invites,
  busyInviteId,
  onClose,
  onCancel,
  onResend,
}: Props) {
  const insets = useSafeAreaInsets();
  const listMaxHeight = Math.min(invites.length, MAX_VISIBLE_INVITES) * INVITE_ROW_HEIGHT;
  const hasMoreInvites = invites.length > MAX_VISIBLE_INVITES;

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
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Pending invites</Text>
              <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
                {invites.length} waiting for {invites.length === 1 ? "a response" : "responses"}
              </Text>
            </View>

            {invites.length === 0 ? (
              <Text style={{ fontSize: 14, color: "#94A3B8", textAlign: "center", paddingVertical: 24 }}>
                No pending invites.
              </Text>
            ) : (
              <ScrollView
                style={{ maxHeight: listMaxHeight }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={hasMoreInvites}
                nestedScrollEnabled
              >
                {invites.map((invite) => {
                  const busy = busyInviteId === invite.id;
                  const inviter = invite.invitedBy?.name ?? invite.invitedBy?.email ?? "Team leader";
                  return (
                    <View
                      key={invite.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: "#F1F5F9",
                      }}
                      testID={`pending-invite-row-${invite.id}`}
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
                        <Text style={{ fontSize: 14, fontWeight: "800", color: "#4361EE" }}>
                          {inviteInitial(invite.email)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                          {invite.email}
                        </Text>
                        <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }} numberOfLines={1}>
                          {inviter} · {formatInviteDate(invite.createdAt)} · {formatInviteExpiry(invite.expiresAt)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Pressable
                          onPress={() => {
                            Alert.alert(
                              "Resend invite?",
                              `Send a new invitation email to ${invite.email}?`,
                              [
                                { text: "Not now", style: "cancel" },
                                { text: "Resend", onPress: () => onResend(invite) },
                              ],
                            );
                          }}
                          disabled={busy}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            backgroundColor: "#EEF2FF",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: busy ? 0.5 : 1,
                          }}
                          testID={`resend-invite-${invite.id}`}
                          accessibilityLabel={`Resend invite to ${invite.email}`}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color="#4361EE" />
                          ) : (
                            <RotateCw size={16} color="#4361EE" />
                          )}
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            Alert.alert(
                              "Cancel invite?",
                              `Cancel invite for ${invite.email}? They won't be able to join with this invitation.`,
                              [
                                { text: "Keep invite", style: "cancel" },
                                { text: "Cancel invite", style: "destructive", onPress: () => onCancel(invite) },
                              ],
                            );
                          }}
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
                          testID={`cancel-invite-${invite.id}`}
                          accessibilityLabel={`Cancel invite for ${invite.email}`}
                        >
                          <X size={16} color="#64748B" />
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
export function PendingInvitesChip({
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
        backgroundColor: "#FFF7ED",
        borderWidth: 1,
        borderColor: "#FED7AA",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
      }}
      testID="pending-invites-chip"
      accessibilityLabel={`${count} pending invite${count !== 1 ? "s" : ""}, tap to manage`}
    >
      <Mail size={14} color="#C2410C" />
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#C2410C" }}>{count} pending</Text>
    </Pressable>
  );
}
