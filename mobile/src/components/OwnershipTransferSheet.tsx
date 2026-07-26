import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { Crown, Check } from "lucide-react-native";
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

const DISPOSITIONS: {
  value: OwnershipTransferDisposition;
  label: string;
  hint: string;
}[] = [
  {
    value: "WORKSPACE_ADMIN",
    label: "Keep me as Workspace Admin",
    hint: "Recommended — you stay as a team leader.",
  },
  {
    value: "MANAGER",
    label: "Change me to Manager",
    hint: "Same mid-tier access as team leader today.",
  },
  {
    value: "MEMBER",
    label: "Change me to Member",
    hint: "You’ll remain on the team as a regular member.",
  },
  {
    value: "REMOVE",
    label: "Remove me after transfer",
    hint: "You’ll leave automatically once they accept.",
  },
];

function RadioRow({
  selected,
  title,
  hint,
  onPress,
  disabled,
  testID,
}: {
  selected: boolean;
  title: string;
  hint: string;
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
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? "#A5B4FC" : "#E2E8F0",
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
        }}
      >
        {selected ? <Check size={12} color="#FFF" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>{title}</Text>
        <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2, lineHeight: 15 }}>{hint}</Text>
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
            {busy ? "Sending…" : "Transfer ownership"}
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
            ? `Reauthenticate to start the transfer to ${displayName}`
            : `Move admin control and billing to ${displayName}`
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      showCloseButton
      footer={footer}
      testID="ownership-transfer-sheet"
      sheetStyle={{ maxHeight: "92%" }}
      bodyHeightRatio={0.72}
    >
      {step === "success" ? (
        <AlenioSheetCard>
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, color: "#334155", lineHeight: 19 }}>
              You’ll see ownership change after they accept
              {billingPath === "REPLACE_PAYMENT_METHOD" ? " and add their card" : ""}. Your plan stays the
              same.
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
                    style={{ width: 30, height: 30 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Crown size={15} color="#FFF" />
                )}
              </AlenioSheetIcon>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[alenioSheetStyles.optionTitle, alenioSheetStyles.optionTitleCompact]} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={alenioSheetStyles.optionSubtitle} numberOfLines={1}>
                  {member.user.email ?? "New workspace owner"}
                </Text>
              </View>
            </View>
          </AlenioSheetCard>

          <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748B", letterSpacing: 0.3 }}>
            AFTER TRANSFER, WHAT HAPPENS TO YOU?
          </Text>
          <View style={{ gap: 8 }}>
            {DISPOSITIONS.map((opt) => (
              <RadioRow
                key={opt.value}
                selected={disposition === opt.value}
                title={opt.label}
                hint={opt.hint}
                disabled={busy}
                onPress={() => setDisposition(opt.value)}
                testID={`ownership-disposition-${opt.value}`}
              />
            ))}
          </View>

          <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748B", letterSpacing: 0.3, marginTop: 4 }}>
            BILLING
          </Text>
          <View style={{ gap: 8 }}>
            <RadioRow
              selected={billingPath === "KEEP_PAYMENT_METHOD"}
              title="Keep existing payment method"
              hint="Same Stripe subscription and card; billing contact updates to the new owner."
              disabled={busy}
              onPress={() => setBillingPath("KEEP_PAYMENT_METHOD")}
              testID="ownership-billing-keep"
            />
            <RadioRow
              selected={billingPath === "REPLACE_PAYMENT_METHOD"}
              title="New owner must add a payment method"
              hint="They add a different card in Stripe. Ownership finishes only after we verify it."
              disabled={busy}
              onPress={() => setBillingPath("REPLACE_PAYMENT_METHOD")}
              testID="ownership-billing-replace"
            />
          </View>

          <AlenioSheetCard tint="slate" compact>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A", marginBottom: 6 }}>Review</Text>
            <Text style={{ fontSize: 12, color: "#64748B", lineHeight: 18 }}>
              · Ownership transfers after they accept (within 7 days){"\n"}
              · Billing responsibility moves with ownership{"\n"}
              · Current plan stays unchanged{"\n"}
              · {dispositionLabel}
              {"\n"}·{" "}
              {billingPath === "KEEP_PAYMENT_METHOD"
                ? "Existing payment method will be kept"
                : "New owner must add a different card before ownership completes"}
            </Text>
          </AlenioSheetCard>

          {error ? (
            <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "600" }}>{error}</Text>
          ) : null}
        </View>
      ) : null}

      {step === "confirm" ? (
        <View style={{ gap: 12 }}>
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
