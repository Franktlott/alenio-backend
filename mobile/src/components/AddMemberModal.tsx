import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Image,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
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

const COLORS = {
  border: "#E2E8F0",
  headBg: "#F8FAFC",
  muted: "#64748B",
  text: "#0F172A",
  subtext: "#475569",
  accent: "#6366F1",
  successBg: "#ECFDF5",
  successText: "#047857",
  inviteBg: "#EFF6FF",
  inviteText: "#1D4ED8",
  noteBg: "#FFFBEB",
  noteBorder: "#FDE68A",
  noteText: "#92400E",
  errorBg: "#FEF2F2",
  errorBorder: "#FECACA",
  errorText: "#B91C1C",
  footerBg: "#FFFFFF",
};

function MemberPreviewCard({ preview, displayName }: { preview: TeamInvitePreview; displayName: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        padding: 12,
        borderRadius: 12,
        backgroundColor: "#F8FAFC",
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {preview.user?.image ? (
          <Image source={{ uri: preview.user.image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: 15, fontWeight: "700", color: COLORS.accent }}>
            {displayName[0]?.toUpperCase() ?? "?"}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: COLORS.text, flexShrink: 1 }} numberOfLines={2}>
            {displayName}
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: preview.found ? COLORS.successBg : COLORS.inviteBg,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 0.4,
                color: preview.found ? COLORS.successText : COLORS.inviteText,
              }}
            >
              {preview.found ? "ON ALENIO" : "NEW INVITE"}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }} numberOfLines={1}>
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
  const insets = useSafeAreaInsets();
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <SafeKeyboardAvoidingView
        style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <Pressable
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(2, 6, 23, 0.45)" }}
          onPress={handleClose}
        />
        <Pressable onPress={(e) => e.stopPropagation?.()} style={{ width: "100%", maxWidth: 420, alignSelf: "center" }}>
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#DCE3EB",
              maxHeight: "82%",
              overflow: "hidden",
              flexDirection: "column",
              shadowColor: "#0F172A",
              shadowOpacity: 0.16,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 10 },
              elevation: 8,
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
                backgroundColor: COLORS.headBg,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: COLORS.text }}>
                    {step === "confirm" ? "Confirm add" : "Add member"}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }} numberOfLines={1}>
                    {teamName}
                  </Text>
                </View>
                <Pressable onPress={handleClose} hitSlop={12} testID="add-member-close" style={{ paddingTop: 2 }}>
                  <X size={20} color={COLORS.muted} />
                </Pressable>
              </View>
            </View>

            {step === "email" ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
                <Text style={{ fontSize: 13, color: COLORS.muted, lineHeight: 19, marginBottom: 14 }}>
                  Enter their email. We&apos;ll look them up before adding them to this workspace.
                </Text>

                {(error || previewError) ? (
                  <View
                    style={{
                      backgroundColor: COLORS.errorBg,
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: COLORS.errorBorder,
                    }}
                    testID="add-member-error"
                  >
                    <Text style={{ fontSize: 13, color: COLORS.errorText, lineHeight: 18 }}>{error ?? previewError}</Text>
                  </View>
                ) : null}

                <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 6 }}>Email address</Text>
                <TextInput
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    onClearError?.();
                    setPreviewError(null);
                  }}
                  placeholder="name@company.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => void handleContinue()}
                  style={{
                    borderWidth: 1,
                    borderColor: "#DCE3EB",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    fontSize: 15,
                    color: COLORS.text,
                  }}
                  testID="add-member-email"
                />
              </View>
            ) : preview ? (
              <ScrollView
                style={{ flexGrow: 0, flexShrink: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 12 }}
              >
                <MemberPreviewCard preview={preview} displayName={displayName} />

                {preview.alreadyMember ? (
                  <View
                    style={{
                      backgroundColor: COLORS.errorBg,
                      borderRadius: 10,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: COLORS.errorBorder,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: COLORS.errorText, lineHeight: 18 }}>
                      This person is already in {teamName}.
                    </Text>
                  </View>
                ) : preview.found ? (
                  <Text style={{ fontSize: 13, color: COLORS.subtext, lineHeight: 19 }}>
                    Add <Text style={{ fontWeight: "700" }}>{preview.user?.name ?? "this person"}</Text> to{" "}
                    <Text style={{ fontWeight: "700" }}>{teamName}</Text>? They&apos;ll join right away.
                  </Text>
                ) : (
                  <Text style={{ fontSize: 13, color: COLORS.subtext, lineHeight: 19 }}>
                    This email isn&apos;t on Alenio yet. We&apos;ll send an invite to join{" "}
                    <Text style={{ fontWeight: "700" }}>{teamName}</Text>.
                  </Text>
                )}

                {preview.pendingInvite && !preview.alreadyMember ? (
                  <View
                    style={{
                      backgroundColor: COLORS.noteBg,
                      borderRadius: 10,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: COLORS.noteBorder,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: COLORS.noteText, lineHeight: 18 }}>
                      Already invited — confirming will refresh their invite.
                    </Text>
                  </View>
                ) : null}

                {preview.found && otherWorkspaces.length > 0 ? (
                  <View
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      overflow: "hidden",
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: "#94A3B8",
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        paddingHorizontal: 12,
                        paddingTop: 10,
                        paddingBottom: 8,
                        backgroundColor: "#F8FAFC",
                      }}
                    >
                      Other workspaces ({otherWorkspaces.length})
                    </Text>
                    {otherWorkspaces.map((ws, index) => (
                      <View
                        key={ws.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderTopWidth: 1,
                          borderTopColor: "#F1F5F9",
                          backgroundColor: index % 2 === 1 ? "#FCFCFD" : "#FFFFFF",
                        }}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            backgroundColor: "#EEF2FF",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                          }}
                        >
                          {ws.image ? (
                            <Image source={{ uri: ws.image }} style={{ width: 32, height: 32 }} resizeMode="cover" />
                          ) : (
                            <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.accent }}>
                              {ws.name[0]?.toUpperCase() ?? "?"}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: COLORS.text }} numberOfLines={1}>
                            {ws.name}
                          </Text>
                          <Text style={{ fontSize: 12, color: "#94A3B8" }}>
                            {ws.role === "owner" ? "Owner" : ws.role === "team_leader" ? "Team Leader" : "Member"}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                {error ? (
                  <View
                    style={{
                      backgroundColor: COLORS.errorBg,
                      borderRadius: 10,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: COLORS.errorBorder,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: COLORS.errorText, lineHeight: 18 }}>{error}</Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: "#EEF2F6",
                backgroundColor: COLORS.footerBg,
              }}
            >
              {step === "confirm" ? (
                <Pressable
                  onPress={goBackToEmail}
                  style={{
                    minWidth: 72,
                    borderWidth: 1,
                    borderColor: "#CBD5E1",
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    alignItems: "center",
                    backgroundColor: "#FFF",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#334155" }}>Back</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={step === "email" ? () => void handleContinue() : handleConfirm}
                disabled={step === "email" ? previewLoading || !email.trim() : confirming || preview?.alreadyMember}
                style={{
                  minWidth: step === "confirm" ? 120 : 96,
                  backgroundColor: COLORS.accent,
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  alignItems: "center",
                  opacity: (step === "email" ? previewLoading || !email.trim() : confirming || preview?.alreadyMember) ? 0.55 : 1,
                }}
                testID={step === "email" ? "add-member-continue" : "add-member-confirm"}
              >
                {step === "email" && previewLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>
                    {step === "email" ? "Continue" : confirming ? "Adding…" : confirmLabel}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </SafeKeyboardAvoidingView>
    </Modal>
  );
}
