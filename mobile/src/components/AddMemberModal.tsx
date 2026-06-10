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
import { X, UserPlus, ChevronLeft } from "lucide-react-native";
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <SafeKeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
      >
        <Pressable
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={handleClose}
        />
        <Pressable onPress={(e) => e.stopPropagation?.()}>
          <View
            style={{
              backgroundColor: "white",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
              maxHeight: "88%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {step === "confirm" ? (
                  <Pressable
                    onPress={() => {
                      setStep("email");
                      setPreview(null);
                      setPreviewError(null);
                    }}
                    hitSlop={12}
                    testID="add-member-back"
                  >
                    <ChevronLeft size={22} color="#64748B" />
                  </Pressable>
                ) : (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: "#EEF2FF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <UserPlus size={20} color="#4361EE" />
                  </View>
                )}
                <View>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>
                    {step === "confirm" ? "Confirm add" : "Add member"}
                  </Text>
                  <Text style={{ fontSize: 13, color: "#64748B" }}>{teamName}</Text>
                </View>
              </View>
              <Pressable onPress={handleClose} hitSlop={12} testID="add-member-close">
                <X size={22} color="#64748B" />
              </Pressable>
            </View>

            {step === "email" ? (
              <>
                <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20, marginBottom: 16 }}>
                  Enter their email. We&apos;ll look them up before adding them to this workspace.
                </Text>

                {(error || previewError) ? (
                  <View
                    style={{
                      backgroundColor: "#FEF2F2",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: "#FECACA",
                    }}
                    testID="add-member-error"
                  >
                    <Text style={{ fontSize: 14, color: "#B91C1C", lineHeight: 20 }}>{error ?? previewError}</Text>
                  </View>
                ) : null}

                <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6 }}>Email address</Text>
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
                    borderColor: "#E2E8F0",
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 16,
                    color: "#0F172A",
                    marginBottom: 16,
                  }}
                  testID="add-member-email"
                />

                <Pressable
                  onPress={() => void handleContinue()}
                  disabled={previewLoading || !email.trim()}
                  style={{
                    backgroundColor: "#4361EE",
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: previewLoading || !email.trim() ? 0.6 : 1,
                  }}
                  testID="add-member-continue"
                >
                  {previewLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>Continue</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={{ alignItems: "center", paddingVertical: 12 }}>
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 36,
                      backgroundColor: "#EEF2FF",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      marginBottom: 12,
                    }}
                  >
                    {preview?.user?.image ? (
                      <Image source={{ uri: preview.user.image }} style={{ width: 72, height: 72 }} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 28, fontWeight: "800", color: "#4361EE" }}>
                        {displayName[0]?.toUpperCase() ?? "?"}
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#0F172A", textAlign: "center" }}>
                    {displayName}
                  </Text>
                  <Text style={{ fontSize: 14, color: "#64748B", marginTop: 4, textAlign: "center" }}>
                    {preview?.email}
                  </Text>
                </View>

                {preview?.alreadyMember ? (
                  <View
                    style={{
                      backgroundColor: "#FEF2F2",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: "#FECACA",
                    }}
                  >
                    <Text style={{ fontSize: 14, color: "#B91C1C", lineHeight: 20, textAlign: "center" }}>
                      This person is already in {teamName}.
                    </Text>
                  </View>
                ) : preview?.found ? (
                  <Text style={{ fontSize: 14, color: "#475569", lineHeight: 20, textAlign: "center", marginBottom: 16 }}>
                    Add {preview.user?.name ?? "this person"} to <Text style={{ fontWeight: "700" }}>{teamName}</Text>?
                    They&apos;ll join right away.
                  </Text>
                ) : (
                  <Text style={{ fontSize: 14, color: "#475569", lineHeight: 20, textAlign: "center", marginBottom: 16 }}>
                    This email isn&apos;t on Alenio yet. We&apos;ll send an invite to join <Text style={{ fontWeight: "700" }}>{teamName}</Text>.
                  </Text>
                )}

                {preview?.pendingInvite && !preview.alreadyMember ? (
                  <View
                    style={{
                      backgroundColor: "#FFFBEB",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: "#FDE68A",
                    }}
                  >
                    <Text style={{ fontSize: 13, color: "#92400E", textAlign: "center" }}>
                      Already invited — confirming will refresh their invite.
                    </Text>
                  </View>
                ) : null}

                {preview?.found && otherWorkspaces.length > 0 ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                      Workspaces ({otherWorkspaces.length})
                    </Text>
                    {otherWorkspaces.map((ws) => (
                      <View
                        key={ws.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          paddingVertical: 10,
                          borderTopWidth: 1,
                          borderTopColor: "#F1F5F9",
                        }}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            backgroundColor: "#EEF2FF",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                          }}
                        >
                          {ws.image ? (
                            <Image source={{ uri: ws.image }} style={{ width: 36, height: 36 }} resizeMode="cover" />
                          ) : (
                            <Text style={{ fontSize: 14, fontWeight: "700", color: "#4361EE" }}>
                              {ws.name[0]?.toUpperCase() ?? "?"}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>{ws.name}</Text>
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
                      backgroundColor: "#FEF2F2",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: "#FECACA",
                    }}
                  >
                    <Text style={{ fontSize: 14, color: "#B91C1C", lineHeight: 20 }}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={handleConfirm}
                  disabled={confirming || preview?.alreadyMember}
                  style={{
                    backgroundColor: "#4361EE",
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: confirming || preview?.alreadyMember ? 0.6 : 1,
                  }}
                  testID="add-member-confirm"
                >
                  {confirming ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
                      {preview?.found ? `Add to ${teamName}` : `Send invite`}
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            )}
          </View>
        </Pressable>
      </SafeKeyboardAvoidingView>
    </Modal>
  );
}
