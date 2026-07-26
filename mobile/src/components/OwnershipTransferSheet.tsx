import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { Crown, Check, Clock } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import {
  initiateOwnershipTransfer,
  type OwnershipBillingPath,
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
    hint: "You remain a team leader after they accept.",
    recommended: true,
  },
  {
    value: "MEMBER",
    label: "Become a Member",
    hint: "You keep access, without admin controls.",
  },
  {
    value: "REMOVE",
    label: "Leave the workspace",
    hint: "You’re removed automatically when they accept.",
  },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "750",
        color: "#64748B",
        letterSpacing: 0.45,
        textTransform: "uppercase",
        marginTop: 2,
      }}
    >
      {children}
    </Text>
  );
}

function RadioRow({
  selected,
  title,
  hint,
  recommended,
  onPress,
  disabled,
  testID,
}: {
  selected: boolean;
  title: string;
  hint: string;
  recommended?: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: selected ? "#818CF8" : "#E2E8F0",
        backgroundColor: selected ? "#EEF2FF" : "#FFFFFF",
        opacity: disabled ? 0.6 : pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          marginTop: 1,
          borderWidth: 2,
          borderColor: selected ? "#4338CA" : "#CBD5E1",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? "#4338CA" : "#FFF",
          flexShrink: 0,
        }}
      >
        {selected ? <Check size={12} color="#FFF" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A", flexShrink: 1 }}>{title}</Text>
          {recommended ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: selected ? "#C7D2FE" : "#EEF2FF",
              }}
            >
              <Text style={{ fontSize: 9, fontWeight: "800", color: "#4338CA", letterSpacing: 0.2 }}>
                RECOMMENDED
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={{ fontSize: 12, color: "#64748B", marginTop: 3, lineHeight: 16 }}>{hint}</Text>
      </View>
    </Pressable>
  );
}

export function OwnershipTransferSheet({ visible, teamId, member, onClose, onStarted }: Props) {
  const displayName = member?.user.name?.trim() || member?.user.email?.trim() || "this member";
  const [step, setStep] = useState<"review" | "confirm" | "success">("review");
  const [disposition, setDisposition] = useState<OwnershipTransferDisposition>("WORKSPACE_ADMIN");
  const [billingPath, setBillingPath] = useState<OwnershipBillingPath>("KEEP_PAYMENT_METHOD");
  const [password, setPassword] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [useSsoConfirm, setUseSsoConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dispositionLabel = useMemo(
    () => DISPOSITIONS.find((d) => d.value === disposition)?.label ?? disposition,
    [disposition],
  );

  const reset = () => {
    setStep("review");
    setDisposition("WORKSPACE_ADMIN");
    setBillingPath("KEEP_PAYMENT_METHOD");
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
        billingPath,
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
          paddingVertical: 13,
          borderRadius: 12,
          backgroundColor: "#4338CA",
          alignItems: "center",
        }}
      >
        <Text style={{ fontWeight: "700", color: "#FFF", fontSize: 14 }}>Done</Text>
      </Pressable>
    ) : step === "review" ? (
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onClose}
          disabled={busy}
          style={{
            flex: 1,
            paddingVertical: 13,
            borderRadius: 12,
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
            flex: 1,
            paddingVertical: 13,
            borderRadius: 12,
            backgroundColor: "#4338CA",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "700", color: "#FFF", fontSize: 14 }}>Continue</Text>
        </Pressable>
      </View>
    ) : (
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => {
            setError(null);
            setStep("review");
          }}
          disabled={busy}
          style={{
            flex: 1,
            paddingVertical: 13,
            borderRadius: 12,
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
            flex: 1,
            paddingVertical: 13,
            borderRadius: 12,
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
            ? `Confirm to offer ownership to ${displayName}`
            : `Offer ownership of this workspace to ${displayName}`
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      showCloseButton
      footer={footer}
      testID="ownership-transfer-sheet"
      sheetStyle={{ maxHeight: "94%" }}
      bodyHeightRatio={step === "success" || step === "confirm" ? 0.42 : 0.62}
      showScrollIndicator={step === "review"}
    >
      {step === "success" ? (
        <AlenioSheetCard style={{ paddingVertical: 14, paddingBottom: 16 }}>
          <View style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                alignSelf: "flex-start",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: "#E0E7FF",
              }}
            >
              <Clock size={13} color="#4338CA" />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#4338CA" }}>Expires in 7 days</Text>
            </View>
            <Text style={{ fontSize: 13, color: "#334155", lineHeight: 20, paddingBottom: 2 }}>
              You’ll stay in your chosen role until they accept
              {billingPath === "REPLACE_PAYMENT_METHOD"
                ? ". They must add a different card than yours to finish"
                : ""}
              . Your plan stays the same.
            </Text>
          </View>
        </AlenioSheetCard>
      ) : null}

      {step === "review" && member ? (
        <View style={{ gap: 12 }}>
          <AlenioSheetCard>
            <View style={[alenioSheetStyles.optionRow, alenioSheetStyles.optionRowCompact]}>
              <AlenioSheetIcon color="#4338CA" compact>
                {member.user.image ? (
                  <Image
                    source={{ uri: member.user.image }}
                    style={{ width: 30, height: 30, borderRadius: 15 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Crown size={15} color="#FFF" />
                )}
              </AlenioSheetIcon>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#6366F1", letterSpacing: 0.4 }}>
                  NEW OWNER
                </Text>
                <Text
                  style={[alenioSheetStyles.optionTitle, alenioSheetStyles.optionTitleCompact]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                <Text style={alenioSheetStyles.optionSubtitle} numberOfLines={1}>
                  {member.user.email ?? "Workspace member"}
                </Text>
              </View>
            </View>
          </AlenioSheetCard>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: "#F8FAFC",
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            <Clock size={14} color="#64748B" />
            <Text style={{ flex: 1, fontSize: 12, color: "#475569", lineHeight: 17 }}>
              They have <Text style={{ fontWeight: "700", color: "#0F172A" }}>7 days</Text> to accept.
              You can cancel anytime before then.
            </Text>
          </View>

          <SectionLabel>Your role after they accept</SectionLabel>
          <View style={{ gap: 8 }}>
            {DISPOSITIONS.map((opt) => (
              <RadioRow
                key={opt.value}
                selected={disposition === opt.value}
                title={opt.label}
                hint={opt.hint}
                recommended={opt.recommended}
                disabled={busy}
                onPress={() => setDisposition(opt.value)}
                testID={`ownership-disposition-${opt.value}`}
              />
            ))}
          </View>

          <SectionLabel>Billing</SectionLabel>
          <View style={{ gap: 8 }}>
            <RadioRow
              selected={billingPath === "KEEP_PAYMENT_METHOD"}
              title="Keep the card on file"
              hint="Your current card stays. Billing contact updates to them."
              disabled={busy}
              onPress={() => setBillingPath("KEEP_PAYMENT_METHOD")}
              testID="ownership-billing-keep"
            />
            <RadioRow
              selected={billingPath === "REPLACE_PAYMENT_METHOD"}
              title="They must add a different card"
              hint="Your card stays until they add a new one. Same card won’t finish the transfer."
              disabled={busy}
              onPress={() => setBillingPath("REPLACE_PAYMENT_METHOD")}
              testID="ownership-billing-replace"
            />
          </View>

          <AlenioSheetCard tint="slate" compact>
            <Text style={{ fontSize: 12, fontWeight: "750", color: "#0F172A", marginBottom: 8 }}>
              Summary
            </Text>
            <View style={{ gap: 6 }}>
              {[
                `Offer ownership to ${displayName}`,
                "Expires in 7 days if not accepted",
                dispositionLabel,
                billingPath === "KEEP_PAYMENT_METHOD"
                  ? "Keep the existing card on file"
                  : "They add a different card to finish",
                "Plan stays the same",
              ].map((line) => (
                <View key={line} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <Text style={{ color: "#6366F1", fontWeight: "800", marginTop: 1 }}>·</Text>
                  <Text style={{ flex: 1, fontSize: 12, color: "#475569", lineHeight: 17 }}>{line}</Text>
                </View>
              ))}
            </View>
          </AlenioSheetCard>

          {error ? (
            <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "600" }}>{error}</Text>
          ) : null}
        </View>
      ) : null}

      {step === "confirm" ? (
        <View style={{ gap: 12 }}>
          <AlenioSheetCard tint="slate" compact>
            <Text style={{ fontSize: 13, color: "#334155", lineHeight: 19 }}>
              You’re offering ownership of this workspace to{" "}
              <Text style={{ fontWeight: "700", color: "#0F172A" }}>{displayName}</Text>. They’ll have 7
              days to accept
              {billingPath === "REPLACE_PAYMENT_METHOD"
                ? ", then must add a different card than the one currently on file"
                : ""}
              .
            </Text>
          </AlenioSheetCard>

          {!useSsoConfirm ? (
            <AlenioSheetCard tint="slate">
              <Text style={{ fontSize: 12, fontWeight: "650", color: "#334155", marginBottom: 8 }}>
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
                  paddingVertical: 11,
                  fontSize: 14,
                  color: "#0F172A",
                }}
              />
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 8 }}>
                Required for accounts with email/password login.
              </Text>
            </AlenioSheetCard>
          ) : (
            <AlenioSheetCard tint="slate">
              <Text style={{ fontSize: 13, color: "#334155", lineHeight: 18, marginBottom: 8 }}>
                This account uses SSO. Type <Text style={{ fontWeight: "700" }}>TRANSFER</Text> to confirm.
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
                  paddingVertical: 11,
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
