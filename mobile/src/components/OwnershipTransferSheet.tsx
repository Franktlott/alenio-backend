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
      style={({ pressed }) => [
        styles.choiceRow,
        !last ? styles.choiceRowBorder : null,
        selected ? styles.choiceRowSelected : null,
        { opacity: disabled ? 0.55 : pressed ? 0.9 : 1 },
      ]}
    >
      <View style={[styles.radio, selected ? styles.radioSelected : null]}>
        {selected ? <Check size={11} color="#FFF" strokeWidth={3.5} /> : null}
      </View>
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceTitle}>{title}</Text>
        {recommended ? (
          <View style={[styles.badge, selected ? styles.badgeSelected : null]}>
            <Text style={styles.badgeText}>RECOMMENDED</Text>
          </View>
        ) : null}
      </View>
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
      <Pressable onPress={onClose} testID="ownership-transfer-done" style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>Done</Text>
      </Pressable>
    ) : step === "review" ? (
      <View style={styles.footerRow}>
        <Pressable onPress={onClose} disabled={busy} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setError(null);
            setStep("confirm");
          }}
          disabled={busy}
          testID="ownership-transfer-continue"
          style={[styles.primaryBtn, styles.primaryBtnFlex]}
        >
          <Text style={styles.primaryBtnText}>Continue</Text>
        </Pressable>
      </View>
    ) : (
      <View style={styles.footerRow}>
        <Pressable
          onPress={() => {
            setError(null);
            setStep("review");
          }}
          disabled={busy}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>Back</Text>
        </Pressable>
        <Pressable
          onPress={() => void submit()}
          disabled={busy || !canSubmitConfirm}
          testID="ownership-transfer-submit"
          style={[
            styles.primaryBtn,
            styles.primaryBtnFlex,
            busy || !canSubmitConfirm ? styles.primaryBtnDisabled : null,
          ]}
        >
          {busy ? <ActivityIndicator color="#FFF" /> : null}
          <Text style={styles.primaryBtnText}>{busy ? "Sending…" : "Send request"}</Text>
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
      sheetStyle={{ maxHeight: "92%" }}
      scrollEnabled={false}
      showScrollIndicator={false}
    >
      {step === "success" ? (
        <AlenioSheetCard compact style={{ paddingVertical: 12 }}>
          <Text style={styles.bodyCopy}>
            You’ll keep your chosen role until they accept. They must add a different card than yours to finish.
            Your plan stays the same.
          </Text>
        </AlenioSheetCard>
      ) : null}

      {step === "review" && member ? (
        <View style={styles.reviewStack}>
          <Text style={styles.sectionLabel}>Your role after they accept</Text>
          <View style={styles.choiceGroup}>
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

          <View style={styles.billingNote} testID="ownership-billing-replace-required">
            <CreditCard size={15} color="#4338CA" />
            <Text style={styles.billingCopy}>
              <Text style={styles.billingStrong}>They add a different card. </Text>
              Your card comes off after setup.
            </Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : null}

      {step === "confirm" ? (
        <View style={styles.reviewStack}>
          <AlenioSheetCard tint="slate" compact>
            <Text style={styles.bodyCopy}>
              They have 7 days to accept, then must add a different card than the one on file.
            </Text>
          </AlenioSheetCard>

          {!useSsoConfirm ? (
            <AlenioSheetCard tint="slate" compact>
              <Text style={styles.fieldLabel}>Account password</Text>
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
                style={styles.input}
              />
            </AlenioSheetCard>
          ) : (
            <AlenioSheetCard tint="slate" compact>
              <Text style={[styles.bodyCopy, { marginBottom: 8 }]}>
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
                style={styles.input}
              />
            </AlenioSheetCard>
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : null}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  reviewStack: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  choiceGroup: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    minHeight: 48,
    backgroundColor: "#FFFFFF",
  },
  choiceRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  choiceRowSelected: {
    backgroundColor: "#F5F3FF",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.75,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginRight: 12,
  },
  radioSelected: {
    borderColor: "#4338CA",
    backgroundColor: "#4338CA",
  },
  choiceCopy: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  choiceTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#EEF2FF",
  },
  badgeSelected: {
    backgroundColor: "#DDD6FE",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#4338CA",
    letterSpacing: 0.3,
  },
  billingNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E7FF",
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  billingCopy: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#475569",
  },
  billingStrong: {
    fontWeight: "700",
    color: "#0F172A",
  },
  bodyCopy: {
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: "#0F172A",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFF",
    alignItems: "center",
  },
  secondaryBtnText: {
    fontWeight: "600",
    color: "#334155",
    fontSize: 14,
  },
  primaryBtn: {
    paddingVertical: 13,
    borderRadius: 11,
    backgroundColor: "#4338CA",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnFlex: {
    flex: 1.15,
  },
  primaryBtnDisabled: {
    backgroundColor: "#A5B4FC",
  },
  primaryBtnText: {
    fontWeight: "700",
    color: "#FFF",
    fontSize: 14,
  },
});
