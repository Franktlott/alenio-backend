import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";
import { UserPlus } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { previewTeamInvite, type TeamInvitePreview } from "@/lib/team-invites-api";

type Props = {
  visible: boolean;
  teamId: string;
  teamName: string;
  confirming: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (email: string) => void;
  onClearError?: () => void;
};

function MemberPreviewCard({ preview, displayName }: { preview: TeamInvitePreview; displayName: string }) {
  return (
    <View style={[alenioSheetStyles.optionRow, alenioSheetStyles.optionRowCompact]}>
      <AlenioSheetIcon color={preview.found ? "#4361EE" : "#7C3AED"} compact>
        {preview.user?.image ? (
          <Image source={{ uri: preview.user.image }} style={{ width: 30, height: 30 }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>
            {displayName[0]?.toUpperCase() ?? "?"}
          </Text>
        )}
      </AlenioSheetIcon>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <Text style={[alenioSheetStyles.optionTitle, alenioSheetStyles.optionTitleCompact]} numberOfLines={2}>
            {displayName}
          </Text>
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: preview.found ? "#ECFDF5" : "#EFF6FF",
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "700",
                letterSpacing: 0.4,
                color: preview.found ? "#047857" : "#1D4ED8",
              }}
            >
              {preview.found ? "ON ALENIO" : "NEW INVITE"}
            </Text>
          </View>
        </View>
        <Text style={alenioSheetStyles.optionSubtitle} numberOfLines={1}>
          {preview.email}
        </Text>
      </View>
    </View>
  );
}

export function AddMemberModal({
  visible,
  teamId,
  teamName,
  confirming,
  error,
  onClose,
  onConfirm,
  onClearError,
}: Props) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "confirm">("email");
  const [preview, setPreview] = useState<TeamInvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setStep("email");
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
  };

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const goBackToEmail = () => {
    setStep("email");
    setPreview(null);
    setPreviewError(null);
  };

  const handleContinue = async () => {
    const trimmed = email.trim();
    if (!trimmed || !teamId) return;
    setPreviewLoading(true);
    setPreviewError(null);
    onClearError?.();
    try {
      const result = await previewTeamInvite(teamId, trimmed);
      setPreview(result);
      setStep("confirm");
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Could not look up this email.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirm = () => {
    const trimmed = email.trim();
    if (!trimmed || preview?.alreadyMember) return;
    onConfirm(trimmed);
  };

  const displayName = preview?.user?.name ?? preview?.email ?? email;
  const otherWorkspaces = (preview?.workspaces ?? []).filter((ws) => !ws.isCurrentTeam);
  const confirmLabel = preview?.found ? "Add member" : "Send invite";
  const title = step === "confirm" ? "Confirm add" : "Add member";
  const subtitle =
    step === "confirm"
      ? `Review before adding to ${teamName}`
      : `Invite someone to ${teamName}`;

  const footerAction = step === "email" ? () => void handleContinue() : handleConfirm;
  const footerDisabled =
    step === "email" ? previewLoading || !email.trim() : confirming || preview?.alreadyMember;
  const footerLoading = step === "email" ? previewLoading : confirming;
  const footerLabel = step === "email" ? "Continue" : confirming ? "Adding…" : confirmLabel;
  const footerTestId = step === "email" ? "add-member-continue" : "add-member-confirm";
  const secondaryLabel = step === "confirm" ? "Back" : "Cancel";
  const secondaryAction = step === "confirm" ? goBackToEmail : handleClose;

  return (
    <AlenioBottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={handleClose}
      compact
      testID="add-member-modal"
      footer={
        <>
          <TouchableOpacity
            onPress={footerAction}
            disabled={footerDisabled}
            style={[alenioSheetStyles.primaryButton, footerDisabled ? alenioSheetStyles.primaryButtonDisabled : null]}
            testID={footerTestId}
            activeOpacity={0.92}
          >
            {footerLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>{footerLabel}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={secondaryAction}
            style={alenioSheetStyles.cancelButton}
            testID={step === "confirm" ? "add-member-back" : "add-member-cancel"}
            activeOpacity={0.8}
          >
            <Text style={alenioSheetStyles.cancelButtonText}>{secondaryLabel}</Text>
          </TouchableOpacity>
        </>
      }
    >
      {step === "email" ? (
        <>
          <AlenioSheetCard compact>
            <View style={[alenioSheetStyles.optionRow, alenioSheetStyles.optionRowCompact]}>
              <AlenioSheetIcon compact>
                <UserPlus size={16} color="white" />
              </AlenioSheetIcon>
              <View style={{ flex: 1 }}>
                <Text style={[alenioSheetStyles.optionTitle, alenioSheetStyles.optionTitleCompact]}>Invite by email</Text>
                <Text style={[alenioSheetStyles.optionSubtitle, alenioSheetStyles.optionSubtitleCompact]}>
                  We&apos;ll look them up before adding them to this workspace.
                </Text>
              </View>
            </View>

            {(error || previewError) ? (
              <View style={alenioSheetStyles.errorBox} testID="add-member-error">
                <Text style={alenioSheetStyles.errorText}>{error ?? previewError}</Text>
              </View>
            ) : null}

            <View>
              <Text style={alenioSheetStyles.fieldLabel}>Email address</Text>
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  onClearError?.();
                  setPreviewError(null);
                }}
                placeholder="name@company.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => void handleContinue()}
                style={alenioSheetStyles.fieldInput}
                testID="add-member-email"
              />
            </View>
          </AlenioSheetCard>
        </>
      ) : preview ? (
        <>
          <AlenioSheetCard compact>
            <MemberPreviewCard preview={preview} displayName={displayName} />
          </AlenioSheetCard>

          {preview.alreadyMember ? (
            <View style={alenioSheetStyles.errorBox}>
              <Text style={alenioSheetStyles.errorText}>This person is already in {teamName}.</Text>
            </View>
          ) : preview.found ? (
            <Text style={alenioSheetStyles.optionSubtitle}>
              Add <Text style={{ fontWeight: "700", color: "#0F172A" }}>{preview.user?.name ?? "this person"}</Text> to{" "}
              <Text style={{ fontWeight: "700", color: "#0F172A" }}>{teamName}</Text>? They&apos;ll join right away.
            </Text>
          ) : (
            <Text style={alenioSheetStyles.optionSubtitle}>
              This email isn&apos;t on Alenio yet. We&apos;ll send an invite to join{" "}
              <Text style={{ fontWeight: "700", color: "#0F172A" }}>{teamName}</Text>.
            </Text>
          )}

          {preview.pendingInvite && !preview.alreadyMember ? (
            <AlenioSheetCard tint="slate" compact>
              <Text style={{ fontSize: 12, color: "#92400E", lineHeight: 16 }}>
                Already invited — confirming will refresh their invite.
              </Text>
            </AlenioSheetCard>
          ) : null}

          {preview.found && otherWorkspaces.length > 0 ? (
            <AlenioSheetCard tint="purple" compact>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6 }}>
                Other workspaces ({otherWorkspaces.length})
              </Text>
              {otherWorkspaces.map((ws) => (
                <View key={ws.id} style={[alenioSheetStyles.optionRow, alenioSheetStyles.optionRowCompact]}>
                  <AlenioSheetIcon color="#7C3AED" compact>
                    {ws.image ? (
                      <Image source={{ uri: ws.image }} style={{ width: 30, height: 30 }} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>
                        {ws.name[0]?.toUpperCase() ?? "?"}
                      </Text>
                    )}
                  </AlenioSheetIcon>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[alenioSheetStyles.optionTitle, alenioSheetStyles.optionTitleCompact]} numberOfLines={1}>
                      {ws.name}
                    </Text>
                    <Text style={alenioSheetStyles.optionSubtitle}>
                      {ws.role === "owner" ? "Owner" : ws.role === "team_leader" ? "Team Leader" : "Member"}
                    </Text>
                  </View>
                </View>
              ))}
            </AlenioSheetCard>
          ) : null}

          {error ? (
            <View style={alenioSheetStyles.errorBox}>
              <Text style={alenioSheetStyles.errorText}>{error}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </AlenioBottomSheet>
  );
}
