import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Crown, Clock } from "lucide-react-native";
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

/** Pending ownership transfer card for Team (sender + recipient). */
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
  const expiryLabel = formatOwnershipExpiry(transfer.expiresAt);
  const end = new Date(transfer.expiresAt);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const daysLeft = Number.isNaN(end.getTime())
    ? 7
    : Math.max(0, Math.round((startOfEnd.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)));
  const chipLabel =
    daysLeft === 0 ? "Today" : daysLeft === 1 ? "1 day" : `${daysLeft} days`;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 4,
        borderRadius: 16,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#E0E7FF",
        overflow: "hidden",
        shadowColor: "#312E81",
        shadowOpacity: 0.1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      }}
      accessibilityLabel="Pending ownership transfer"
    >
      <LinearGradient
        colors={["#4338CA", "#6366F1"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.18)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Crown size={16} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.75)", letterSpacing: 0.5 }}>
            OWNERSHIP
          </Text>
          <Text style={{ fontSize: 15, fontWeight: "750", color: "#FFFFFF", marginTop: 1 }} numberOfLines={1}>
            Transfer pending
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 9,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.16)",
          }}
        >
          <Clock size={12} color="#FFFFFF" />
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFFFFF" }} numberOfLines={1}>
            {chipLabel}
          </Text>
        </View>
      </LinearGradient>

      <View style={{ padding: 14, gap: 12 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: "650", color: "#0F172A", lineHeight: 18 }}>
            {fromName}
            <Text style={{ color: "#94A3B8", fontWeight: "600" }}> → </Text>
            {toName}
          </Text>
          <Text style={{ fontSize: 12, color: "#64748B", lineHeight: 17 }}>
            {expiryLabel}
            {transfer.awaitingPaymentMethod
              ? " · Previous owner’s card is still on file"
              : isSender
                ? " · Waiting for them to accept"
                : " · Accept to become workspace owner"}
          </Text>
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
                  paddingVertical: 10,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  backgroundColor: "#F8FAFC",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "650", color: "#334155" }}>Decline</Text>
              </Pressable>
              <Pressable
                onPress={onAccept}
                disabled={busy}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 11,
                  backgroundColor: "#4338CA",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  shadowColor: "#4338CA",
                  shadowOpacity: 0.28,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                {busy ? <ActivityIndicator color="#FFF" size="small" /> : null}
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFF" }}>
                  {transfer.awaitingPaymentMethod ? "Add different card" : "Accept"}
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
                paddingVertical: 10,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                backgroundColor: "#F8FAFC",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "650", color: "#334155" }}>
                {busy ? "Canceling…" : "Cancel transfer"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
