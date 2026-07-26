import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Check, CreditCard } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
} from "@/components/AlenioBottomSheet";
import {
  initiateOwnershipTransfer,
  type OwnershipTransferDisposition,
} from "@/lib/ownership-transfer-api";

type MemberLite = {
  userId: string;
  user: { name: string | null; email: string | null; image: string | null };
};

type Props = {
  visible: boolean;
  teamId: string;
  member: MemberLite | null;
  onClose: () => void;
  onStarted: () => void;
};

/** MANAGER maps to the same role as WORKSPACE_ADMIN today — omit to keep the sheet short. */
const DISPOSITIONS: {
  value: OwnershipTransferDisposition;
  label: string;
  recommended?: boolean;
}[] = [
  {
    value: "WORKSPACE_ADMIN",
    label: "Stay as Workspace Admin",
    recommended: true,
  },
  {
    value: "MEMBER",
    label: "Become a Member",
  },
  {
    value: "REMOVE",
    label: "Leave the workspace",
  },
];

function ChoiceRow({
  selected,
  title,
  recommended,
  onPress,
  disabled,
  testID,
  last,
}: {
  selected: boolean;
  title: string;
  recommended?: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 9,
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: "#E2E8F0",
        backgroundColor: selected ? "#F5F3FF" : "#FFFFFF",
        opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          width: 17,
          height: 17,
          borderRadius: 9,
          borderWidth: 1.75,
          borderColor: selected ? "#4338CA" : "#CBD5E1",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? "#4338CA" : "#FFF",
          flexShrink: 0,
        }}
      >
        {selected ? <Check size={10} color="#FFF" strokeWidth={3.5} /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "650", color: "#0F172A" }} numberOfLines={1}>
        {title}
      </Text>
      {recommended ? (
        <View
          style={{
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 4,
            backgroundColor: selected ? "#DDD6FE" : "#EEF2FF",
          }}
        >
          <Text style={{ fontSize: 8, fontWeight: "800", color: "#4338CA", letterSpacing: 0.3 }}>
            RECOMMENDED
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function OwnershipTransferSheet({ visible, teamId, member, onClose, onStarted }: Props) {
  const displayName = member?.user.name?.trim() || member?.user.email?.trim() || "this member";
  const [step, setStep] = useState<"review" | "confirm" | "success">("review");
  const [disposition, setDisposition] = useState<OwnershipTransferDisposition>("WORKSPACE_ADMIN");
  const [password, setPassword] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [useSsoConfirm, setUseSsoConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("review");
    setDisposition("WORKSPACE_ADMIN");
    setPassword("");
    setConfirmPhrase("");
    setUseSsoConfirm(false);
    setBusy(false);
    setError(null);
  };

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const submit = async () => {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      await initiateOwnershipTransfer(teamId, {
        toUserId: member.userId,
        previousOwnerDisposition: disposition,
        billingPath: "REPLACE_PAYMENT_METHOD",
        ...(useSsoConfirm ? { confirmPhrase: "TRANSFER" } : { password }),
      });
      setStep("success");
      onStarted();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transfer failed.";
      if (/typing TRANSFER|SSO reauthentication/i.test(msg)) {
        setUseSsoConfirm(true);
        setPassword("");
      } else {
        setUseSsoConfirm(false);
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const canSubmitConfirm = useSsoConfirm
    ? confirmPhrase.trim() === "TRANSFER"
    : password.trim().length > 0;

  const footer =
    step === "success" ? (
      <Pressable
        onPress={onClose}
        testID="ownership-transfer-done"
        style={{
          paddingVertical: 12,
          borderRadius: 11,
          backgroundColor: "#4338CA",
          alignItems: "center",
        }}
      >
        <Text style={{ fontWeight: "700", color: "#FFF", fontSize: 14 }}>Done</Text>
      </Pressable>
    ) : step === "review" ? (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={onClose}
          disabled={busy}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            backgroundColor: "#FFF",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "650", color: "#334155", fontSize: 14 }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setError(null);
            setStep("confirm");
          }}
          disabled={busy}
          testID="ownership-transfer-continue"
          style={{
            flex: 1.2,
            paddingVertical: 12,
            borderRadius: 11,
            backgroundColor: "#4338CA",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "700", color: "#FFF", fontSize: 14 }}>Continue</Text>
        </Pressable>
      </View>
    ) : (
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => {
            setError(null);
            setStep("review");
          }}
          disabled={busy}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            backgroundColor: "#FFF",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "650", color: "#334155", fontSize: 14 }}>Back</Text>
        </Pressable>
        <Pressable
          onPress={() => void submit()}
          disabled={busy || !canSubmitConfirm}
          testID="ownership-transfer-submit"
          style={{
            flex: 1.2,
            paddingVertical: 12,
            borderRadius: 11,
            backgroundColor: busy || !canSubmitConfirm ? "#A5B4FC" : "#4338CA",
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {busy ? <ActivityIndicator color="#FFF" /> : null}
          <Text style={{ fontWeight: "700", color: "#FFF", fontSize: 14 }}>
            {busy ? "Sending…" : "Send request"}
          </Text>
        </Pressable>
      </View>
    );

  return (
    <AlenioBottomSheet
      visible={visible && !!member}
      title={
        step === "success"
          ? "Transfer request sent"
          : step === "confirm"
            ? "Confirm transfer"
            : "Transfer ownership"
      }
      subtitle={
        step === "success"
          ? `${displayName} has 7 days to accept`
          : step === "confirm"
            ? `Offer ownership to ${displayName}`
            : `To ${displayName} · they add their card · 7 days`
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      showCloseButton
      footer={footer}
      testID="ownership-transfer-sheet"
      compact
      sheetStyle={{ maxHeight: "88%" }}
      scrollEnabled={false}
      showScrollIndicator={false}
    >
      {step === "success" ? (
        <AlenioSheetCard compact style={{ paddingVertical: 10 }}>
          <Text style={{ fontSize: 13, color: "#334155", lineHeight: 18 }}>
            You’ll keep your chosen role until they accept. They must add a different card than yours to finish.
            Your plan stays the same.
          </Text>
        </AlenioSheetCard>
      ) : null}

      {step === "review" && member ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: "#64748B",
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Your role after they accept
          </Text>
          <View
            style={{
              borderRadius: 11,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#FFFFFF",
              overflow: "hidden",
            }}
          >
            {DISPOSITIONS.map((opt, i) => (
              <ChoiceRow
                key={opt.value}
                selected={disposition === opt.value}
                title={opt.label}
                recommended={opt.recommended}
                disabled={busy}
                onPress={() => setDisposition(opt.value)}
                testID={`ownership-disposition-${opt.value}`}
                last={i === DISPOSITIONS.length - 1}
              />
            ))}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderRadius: 11,
              borderWidth: 1,
              borderColor: "#E0E7FF",
              backgroundColor: "#F8FAFF",
              paddingHorizontal: 10,
              paddingVertical: 9,
            }}
            testID="ownership-billing-replace-required"
          >
            <CreditCard size={14} color="#4338CA" />
            <Text style={{ flex: 1, fontSize: 12, color: "#334155", lineHeight: 16 }}>
              <Text style={{ fontWeight: "700", color: "#0F172A" }}>They add a different card.</Text>
              {" "}Your card comes off after setup.
            </Text>
          </View>

          {error ? (
            <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "600" }}>{error}</Text>
          ) : null}
        </View>
      ) : null}

      {step === "confirm" ? (
        <View style={{ gap: 8 }}>
          <AlenioSheetCard tint="slate" compact>
            <Text style={{ fontSize: 13, color: "#334155", lineHeight: 18 }}>
              They have 7 days to accept, then must add a different card than the one on file.
            </Text>
          </AlenioSheetCard>

          {!useSsoConfirm ? (
            <AlenioSheetCard tint="slate" compact>
              <Text style={{ fontSize: 12, fontWeight: "650", color: "#334155", marginBottom: 6 }}>
                Account password
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                testID="ownership-transfer-password"
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  backgroundColor: "#FFF",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: "#0F172A",
                }}
              />
            </AlenioSheetCard>
          ) : (
            <AlenioSheetCard tint="slate" compact>
              <Text style={{ fontSize: 13, color: "#334155", lineHeight: 18, marginBottom: 6 }}>
                SSO account — type <Text style={{ fontWeight: "700" }}>TRANSFER</Text> to confirm.
              </Text>
              <TextInput
                value={confirmPhrase}
                onChangeText={setConfirmPhrase}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                placeholder="TRANSFER"
                placeholderTextColor="#94A3B8"
                testID="ownership-transfer-phrase"
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  backgroundColor: "#FFF",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: "#0F172A",
                }}
              />
            </AlenioSheetCard>
          )}
          {error ? (
            <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "600" }}>{error}</Text>
          ) : null}
        </View>
      ) : null}
    </AlenioBottomSheet>
  );
}
