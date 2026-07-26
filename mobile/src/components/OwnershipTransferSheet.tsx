import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import { Crown, Check, Clock } from "lucide-react-native";
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
  hint: string;
  recommended?: boolean;
}[] = [
  {
    value: "WORKSPACE_ADMIN",
    label: "Stay as Workspace Admin",
    hint: "Remain a team leader after they accept",
    recommended: true,
  },
  {
    value: "MEMBER",
    label: "Become a Member",
    hint: "Keep access without admin controls",
  },
  {
    value: "REMOVE",
    label: "Leave the workspace",
    hint: "Removed automatically when they accept",
  },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 10,
        fontWeight: "700",
        color: "#64748B",
        letterSpacing: 0.7,
        textTransform: "uppercase",
        marginBottom: 6,
        marginTop: 2,
      }}
    >
      {children}
    </Text>
  );
}

function ChoiceRow({
  selected,
  title,
  hint,
  recommended,
  onPress,
  disabled,
  testID,
  last,
}: {
  selected: boolean;
  title: string;
  hint: string;
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
        gap: 10,
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: "#E2E8F0",
        backgroundColor: selected ? "#F5F3FF" : "#FFFFFF",
        opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          width: 18,
          height: 18,
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "650", color: "#0F172A" }}>{title}</Text>
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
        </View>
        <Text style={{ fontSize: 11, color: "#64748B", marginTop: 1, lineHeight: 14 }} numberOfLines={1}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

function ChoiceGroup({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        backgroundColor: "#FFFFFF",
        overflow: "hidden",
      }}
    >
      {children}
    </View>
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
            ? `Confirm offering ownership to ${displayName}`
            : "Choose your role after they accept — they’ll add their own card to finish"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      showCloseButton
      footer={footer}
      testID="ownership-transfer-sheet"
      compact
      sheetStyle={{ maxHeight: "92%" }}
      bodyHeightRatio={step === "success" || step === "confirm" ? 0.36 : 0.78}
      showScrollIndicator={step === "review"}
    >
      {step === "success" ? (
        <AlenioSheetCard compact style={{ paddingVertical: 12 }}>
          <View style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                alignSelf: "flex-start",
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: "#E0E7FF",
              }}
            >
              <Clock size={12} color="#4338CA" />
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#4338CA" }}>Expires in 7 days</Text>
            </View>
            <Text style={{ fontSize: 13, color: "#334155", lineHeight: 19 }}>
              You’ll keep your chosen role until they accept. They must add a different card than yours to
              finish. Your plan stays the same.
            </Text>
          </View>
        </AlenioSheetCard>
      ) : null}

      {step === "review" && member ? (
        <View style={{ gap: 12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 11,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E0E7FF",
              backgroundColor: "#F8FAFF",
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "#4338CA",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {member.user.image ? (
                <Image
                  source={{ uri: member.user.image }}
                  style={{ width: 36, height: 36 }}
                  resizeMode="cover"
                />
              ) : (
                <Crown size={16} color="#FFF" />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 9, fontWeight: "800", color: "#6366F1", letterSpacing: 0.6 }}>
                NEW OWNER
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", marginTop: 1 }} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 1 }} numberOfLines={1}>
                {member.user.email ?? "Workspace member"}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 8,
                backgroundColor: "#EEF2FF",
              }}
            >
              <Clock size={11} color="#4338CA" />
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#4338CA" }}>7 days</Text>
            </View>
          </View>

          <View>
            <SectionLabel>Your role after they accept</SectionLabel>
            <ChoiceGroup>
              {DISPOSITIONS.map((opt, i) => (
                <ChoiceRow
                  key={opt.value}
                  selected={disposition === opt.value}
                  title={opt.label}
                  hint={opt.hint}
                  recommended={opt.recommended}
                  disabled={busy}
                  onPress={() => setDisposition(opt.value)}
                  testID={`ownership-disposition-${opt.value}`}
                  last={i === DISPOSITIONS.length - 1}
                />
              ))}
            </ChoiceGroup>
          </View>

          <View>
            <SectionLabel>Billing</SectionLabel>
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#E0E7FF",
                backgroundColor: "#F8FAFF",
                paddingHorizontal: 12,
                paddingVertical: 11,
                gap: 4,
              }}
              testID="ownership-billing-replace-required"
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>
                They add a different card
              </Text>
              <Text style={{ fontSize: 11, color: "#64748B", lineHeight: 15 }}>
                Your card comes off the workspace after they finish setup. Same card won’t complete the
                transfer.
              </Text>
            </View>
          </View>

          {error ? (
            <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "600" }}>{error}</Text>
          ) : null}
        </View>
      ) : null}

      {step === "confirm" ? (
        <View style={{ gap: 10 }}>
          <AlenioSheetCard tint="slate" compact>
            <Text style={{ fontSize: 13, color: "#334155", lineHeight: 18 }}>
              Offer ownership to <Text style={{ fontWeight: "700", color: "#0F172A" }}>{displayName}</Text>.
              They have 7 days to accept, then must add a different card than the one on file.
            </Text>
          </AlenioSheetCard>

          {!useSsoConfirm ? (
            <AlenioSheetCard tint="slate" compact>
              <Text style={{ fontSize: 12, fontWeight: "650", color: "#334155", marginBottom: 7 }}>
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
              <Text style={{ fontSize: 13, color: "#334155", lineHeight: 18, marginBottom: 7 }}>
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
