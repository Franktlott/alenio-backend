import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Crown } from "lucide-react-native";
import type { OwnershipTransfer } from "@/lib/ownership-transfer-api";

function formatOwnershipExpiry(iso: string) {
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return "Expires soon";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const days = Math.round((startOfEnd.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
  const dateLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days < 0) return `Expired ${dateLabel}`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 7) return `Expires in ${days} days (${dateLabel})`;
  return `Expires ${dateLabel}`;
}

type Props = {
  transfer: OwnershipTransfer;
  myUserId: string | null | undefined;
  busy: boolean;
  error?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
};

/** Pending ownership transfer strip for Team (sender + recipient). */
export function OwnershipTransferPendingBanner({
  transfer,
  myUserId,
  busy,
  error,
  onAccept,
  onDecline,
  onCancel,
}: Props) {
  const isRecipient = !!myUserId && transfer.toUserId === myUserId;
  const isSender = !!myUserId && transfer.fromUserId === myUserId;
  const fromName = transfer.fromUser.name?.trim() || transfer.fromUser.email?.trim() || "Owner";
  const toName = transfer.toUser.name?.trim() || transfer.toUser.email?.trim() || "Member";

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#C7D2FE",
        backgroundColor: "#EEF2FF",
        padding: 14,
        gap: 10,
      }}
      accessibilityLabel="Pending ownership transfer"
    >
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: "#4338CA",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Crown size={16} color="#FFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: "750", color: "#0F172A" }}>
            Ownership transfer pending
          </Text>
          <Text style={{ fontSize: 12, color: "#475569", marginTop: 3, lineHeight: 17 }}>
            {fromName} → {toName}
            {" · "}
            {formatOwnershipExpiry(transfer.expiresAt)}
            {transfer.awaitingPaymentMethod ? " · awaiting payment method" : ""}
          </Text>
        </View>
      </View>

      {error ? (
        <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "600" }}>{error}</Text>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {isRecipient ? (
          <>
            <Pressable
              onPress={onDecline}
              disabled={busy}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                backgroundColor: "#FFF",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "650", color: "#334155" }}>Decline</Text>
            </Pressable>
            <Pressable
              onPress={onAccept}
              disabled={busy}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: "#4338CA",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              {busy ? <ActivityIndicator color="#FFF" size="small" /> : null}
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFF" }}>
                {transfer.awaitingPaymentMethod ? "Add card" : "Accept"}
              </Text>
            </Pressable>
          </>
        ) : null}
        {isSender ? (
          <Pressable
            onPress={onCancel}
            disabled={busy}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#FFF",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "650", color: "#334155" }}>
              {busy ? "Canceling…" : "Cancel transfer"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
