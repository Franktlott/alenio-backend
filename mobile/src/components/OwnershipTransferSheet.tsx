import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
import { UserAvatar } from "@/components/UserAvatar";

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
  note?: string;
  recommended?: boolean;
}[] = [
  {
    value: "WORKSPACE_ADMIN",
    label: "Stay as Workspace Admin",
    note: "You’ll stay as a team leader after they accept.",
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
  note,
  recommended,
  onPress,
  disabled,
  testID,
  last,
}: {
  selected: boolean;
  title: string;
  note?: string;
  recommended?: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  last?: boolean;
}) {
  const a11y = [title, recommended ? "Recommended" : null, note].filter(Boolean).join(". ");
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={a11y}
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        alignSelf: "stretch",
        width: "100%",
        minHeight: 52,
        paddingVertical: 13,
        paddingHorizontal: 14,
        backgroundColor: selected ? "#EEF2FF" : "#FFFFFF",
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: "#E2E8F0",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? "#4338CA" : "#CBD5E1",
          backgroundColor: selected ? "#4338CA" : "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
          marginTop: 1,
        }}
      >
        {selected ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          className="text-slate-900 text-[15px] font-semibold"
          style={{ color: "#0F172A", fontSize: 15, fontWeight: "600" }}
          numberOfLines={2}
        >
          {recommended ? `${title} · Recommended` : title}
        </Text>
        {note ? (
          <Text
            className="text-slate-500 text-[12px]"
            style={{ color: "#64748B", fontSize: 12, lineHeight: 16, marginTop: 3 }}
          >
            {note}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
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
      <TouchableOpacity onPress={onClose} testID="ownership-transfer-done" style={styles.primaryBtn} activeOpacity={0.85}>
        <Text className="text-white text-[14px] font-bold" style={styles.primaryBtnText}>
          Done
        </Text>
      </TouchableOpacity>
    ) : step === "review" ? (
      <View style={styles.footerRow}>
        <TouchableOpacity onPress={onClose} disabled={busy} style={styles.secondaryBtn} activeOpacity={0.85}>
          <Text className="text-slate-700 text-[14px] font-semibold" style={styles.secondaryBtnText}>
            Cancel
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setError(null);
            setStep("confirm");
          }}
          disabled={busy}
          testID="ownership-transfer-continue"
          style={[styles.primaryBtn, styles.primaryBtnFlex]}
          activeOpacity={0.85}
        >
          <Text className="text-white text-[14px] font-bold" style={styles.primaryBtnText}>
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    ) : (
      <View style={styles.footerRow}>
        <TouchableOpacity
          onPress={() => {
            setError(null);
            setStep("review");
          }}
          disabled={busy}
          style={styles.secondaryBtn}
          activeOpacity={0.85}
        >
          <Text className="text-slate-700 text-[14px] font-semibold" style={styles.secondaryBtnText}>
            Back
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void submit()}
          disabled={busy || !canSubmitConfirm}
          testID="ownership-transfer-submit"
          style={[
            styles.primaryBtn,
            styles.primaryBtnFlex,
            busy || !canSubmitConfirm ? styles.primaryBtnDisabled : null,
          ]}
          activeOpacity={0.85}
        >
          {busy ? <ActivityIndicator color="#FFF" /> : null}
          <Text className="text-white text-[14px] font-bold" style={styles.primaryBtnText}>
            {busy ? "Sending…" : "Send request"}
          </Text>
        </TouchableOpacity>
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
          <Text className="text-slate-700 text-[13px]" style={styles.bodyCopy}>
            You’ll keep your chosen role until they accept. They must add a different card than yours to finish.
            Your plan stays the same.
          </Text>
        </AlenioSheetCard>
      ) : null}

      {step === "review" && member ? (
        <View style={styles.reviewStack}>
          <View style={styles.recipientRow}>
            <UserAvatar
              user={member.user}
              size={36}
              radius={18}
              backgroundColor="#EEF2FF"
              textColor="#4338CA"
              fontSize={13}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.recipientName} numberOfLines={1}>
                {displayName}
              </Text>
              {member.user.email ? (
                <Text style={styles.recipientEmail} numberOfLines={1}>
                  {member.user.email}
                </Text>
              ) : null}
            </View>
          </View>

          <Text className="text-slate-500 text-[11px] font-bold uppercase" style={styles.sectionLabel}>
            Your role after they accept
          </Text>
          <View style={styles.choiceGroup}>
            {DISPOSITIONS.map((opt, i) => (
              <ChoiceRow
                key={opt.value}
                selected={disposition === opt.value}
                title={opt.label}
                note={opt.note}
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
            <Text className="text-slate-600 text-[13px] flex-1" style={styles.billingCopy}>
              <Text className="text-slate-900 font-bold" style={styles.billingStrong}>
                They add a different card.{" "}
              </Text>
              Your card comes off after setup.
            </Text>
          </View>

          {error ? (
            <Text className="text-red-600 text-[12px] font-semibold" style={styles.errorText}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}

      {step === "confirm" ? (
        <View style={styles.reviewStack}>
          <AlenioSheetCard tint="slate" compact>
            <Text className="text-slate-700 text-[13px]" style={styles.bodyCopy}>
              They have 7 days to accept, then must add a different card than the one on file.
            </Text>
          </AlenioSheetCard>

          {!useSsoConfirm ? (
            <AlenioSheetCard tint="slate" compact>
              <Text className="text-slate-700 text-[12px] font-semibold" style={styles.fieldLabel}>
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
                style={styles.input}
              />
            </AlenioSheetCard>
          ) : (
            <AlenioSheetCard tint="slate" compact>
              <Text className="text-slate-700 text-[13px]" style={[styles.bodyCopy, { marginBottom: 8 }]}>
                SSO account — type <Text className="font-bold">TRANSFER</Text> to confirm.
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
          {error ? (
            <Text className="text-red-600 text-[12px] font-semibold" style={styles.errorText}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  reviewStack: {
    width: "100%",
    gap: 12,
  },
  recipientRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  recipientName: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  recipientEmail: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 11,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  choiceGroup: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  billingNote: {
    width: "100%",
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
