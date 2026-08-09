import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  Image,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScanLine, Building2, Users, X, Camera, CheckCircle2, ShieldCheck, Clock3 } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import { NO_WORKSPACE_WELCOME_PATH } from "@/lib/no-workspace-routing";
import { WELCOME_UI } from "@/components/no-workspace-welcome/welcome-ui";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { uploadFile } from "@/lib/upload";

const INVITE_CODE_MAX_LENGTH = 12;
const INDUSTRIES = ["Retail", "Hospitality", "Healthcare", "Food service", "Operations", "Other"] as const;
type JoinResult =
  | { status: "pending"; teamName: string; requestId: string }
  | (Team & { status?: undefined });

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "create" | "join";
  onChange: (mode: "create" | "join") => void;
}) {
  return (
    <View style={styles.modeToggle}>
      {(["create", "join"] as const).map((value) => {
        const selected = mode === value;
        return (
          <TouchableOpacity
            key={value}
            onPress={() => onChange(value)}
            testID={value === "create" ? "mode-create" : "mode-join"}
            style={[styles.modeOption, selected ? styles.modeOptionActive : null]}
            activeOpacity={0.9}
          >
            <Text style={[styles.modeOptionText, selected ? styles.modeOptionTextActive : null]}>
              {value === "create" ? "Create" : "Join"}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={alenioSheetStyles.fieldLabel}>{children}</Text>;
}

export default function OnboardingScreen() {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { intent, mode: modeParam, focus: focusParam, action: actionParam, code: codeParam } = useLocalSearchParams<{
    intent?: string;
    mode?: string;
    focus?: string;
    action?: string;
    code?: string;
  }>();
  const isAddFlow = intent === "add";
  const initialCode =
    typeof codeParam === "string"
      ? codeParam.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, INVITE_CODE_MAX_LENGTH)
      : "";
  const [mode, setMode] = useState<"create" | "join">(modeParam === "join" || !!initialCode ? "join" : "create");
  const [teamName, setTeamName] = useState("");
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [industry, setIndustry] = useState("");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number>(0);
  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const insets = useSafeAreaInsets();

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const inviteCodeInputRef = useRef<TextInput>(null);
  const scanActionHandledRef = useRef(false);

  useEffect(() => {
    if (!initialCode) return;
    setMode("join");
    setInviteCode(initialCode);
  }, [initialCode]);

  useEffect(() => {
    if (mode !== "join" || focusParam !== "code") return;
    const timer = setTimeout(() => inviteCodeInputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [focusParam, mode]);

  useEffect(() => {
    if (isSessionLoading) return;
    if (!session?.user) {
      router.replace({
        pathname: "/sign-in",
        params: { reason: "session-required" },
      });
    }
  }, [isSessionLoading, session?.user]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Team>("/api/teams", {
        name: teamName.trim(),
        industry: industry.trim() || undefined,
        startTrial: true,
      }),
    onSuccess: async (team) => {
      if (logoUri) {
        try {
          const uploaded = await uploadFile(logoUri, "workspace-logo.jpg", "image/jpeg", {
            purpose: "team",
            teamId: team.id,
          });
          await api.patch<Team>(`/api/teams/${team.id}`, { image: uploaded.url });
        } catch {
          // The workspace is still valid; its logo can be added later in settings.
        }
      }
      setActiveTeamId(team.id);
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      await queryClient.invalidateQueries({ queryKey: ["subscription", team.id] });
      await queryClient.invalidateQueries({ queryKey: ["billing-workspaces"] });
      router.replace({ pathname: "/workspace-welcome", params: { teamId: team.id, teamName: team.name } });
    },
    onError: (err: unknown) => {
      const rawMsg = err instanceof Error ? err.message : "";
      if (/too many requests|over.*rate.*limit|429/i.test(rawMsg)) {
        const waitMs = 20_000;
        setCooldownUntilMs(Date.now() + waitMs);
        setError("Too many requests right now. Please wait 20 seconds, then try again.");
        return;
      }
      setError(rawMsg || "Could not create team right now. Please try again.");
    },
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) =>
      api.post<JoinResult>("/api/teams/join", {
        inviteCode: code,
      }),
    onSuccess: (result) => {
      if (result.status === "pending") {
        queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] });
        if (isAddFlow && router.canGoBack()) {
          router.back();
        } else if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(NO_WORKSPACE_WELCOME_PATH);
        }
        return;
      }
      const team = result as Team;
      setActiveTeamId(team.id);
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      if (isAddFlow && router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(app)/chat");
      }
    },
    onError: (err: unknown) => {
      const rawMsg = err instanceof Error ? err.message : "";
      if (/too many requests|over.*rate.*limit|429/i.test(rawMsg)) {
        const waitMs = 20_000;
        setCooldownUntilMs(Date.now() + waitMs);
        setError("Too many requests right now. Please wait 20 seconds, then try again.");
        return;
      }
      if (/already a member/i.test(rawMsg)) {
        setError("You're already in this workspace. Open the app to switch to it.");
        return;
      }
      if (/request already pending/i.test(rawMsg)) {
        queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] });
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(NO_WORKSPACE_WELCOME_PATH);
        }
        return;
      }
      if (/invalid invite code/i.test(rawMsg)) {
        setError(
          "No workspace found with that code. Ask your admin for the invite code from Team settings — not an email invite link.",
        );
        return;
      }
      setError(rawMsg || "Could not join right now. Please try again.");
    },
  });

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (scannedRef.current || joinMutation.isPending) return;
    const match = data.match(/alenio:\/\/join\/([A-Z0-9]+)/i) ?? data.match(/^([A-Z0-9]{6,12})$/i);
    if (!match) return;
    scannedRef.current = true;
    setScannerOpen(false);
    joinMutation.mutate(match[1]!.toUpperCase());
  };

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      Alert.alert(
        "Camera access needed",
        "Alenio uses your camera to scan workspace QR codes. You can also enter an invite code manually.",
        [
          { text: "Enter code manually", style: "cancel" },
          {
            text: "Continue",
            onPress: async () => {
              const result = await requestCameraPermission();
              if (!result.granted) {
                Alert.alert(
                  "Camera permission denied",
                  "Enable camera access in Settings, or enter your invite code manually.",
                );
                return;
              }
              scannedRef.current = false;
              setScannerOpen(true);
            },
          },
        ],
      );
      return;
    }
    scannedRef.current = false;
    setScannerOpen(true);
  };

  useEffect(() => {
    if (mode !== "join" || actionParam !== "scan" || scanActionHandledRef.current) return;
    scanActionHandledRef.current = true;
    void openScanner();
  }, [actionParam, mode]);

  const isCoolingDown = Date.now() < cooldownUntilMs;
  const isLoading = createMutation.isPending || joinMutation.isPending || isCoolingDown;

  const handleSubmit = () => {
    setError(null);
    if (Date.now() < cooldownUntilMs) {
      const seconds = Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000));
      setError(`Please wait ${seconds}s before trying again.`);
      return;
    }
    if (mode === "create") {
      if (!teamName.trim()) {
        setError("Please enter a workspace name");
        return;
      }
      if (!industry.trim()) {
        setError("Please choose an industry");
        return;
      }
      if (createStep === 1) {
        setCreateStep(2);
        return;
      }
      createMutation.mutate();
    } else {
      if (!inviteCode.trim()) {
        setError("Please enter an invite code");
        return;
      }
      joinMutation.mutate(inviteCode.trim().toUpperCase());
    }
  };

  const handleClose = () => {
    if (isAddFlow && router.canGoBack()) {
      router.back();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(NO_WORKSPACE_WELCOME_PATH);
  };

  const isModeLocked = modeParam === "join" || modeParam === "create";

  const sheetTitle =
    mode === "create"
      ? createStep === 1
        ? "Create a workspace"
        : "Start your trial"
      : isAddFlow
        ? "Add workplace"
        : "Join a workspace";
  const sheetSubtitle =
    mode === "create"
      ? createStep === 1
        ? "Tell us about your operation"
        : "14 days of Operations, no card required"
      : "Connect with your organization";

  const sheetFooter = (
    <>
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={isLoading}
        style={[alenioSheetStyles.primaryButton, isLoading ? alenioSheetStyles.primaryButtonDisabled : null]}
        testID="submit-button"
        activeOpacity={0.92}
      >
        {createMutation.isPending || joinMutation.isPending ? (
          <ActivityIndicator color="white" />
        ) : isCoolingDown ? (
          <Text style={alenioSheetStyles.primaryButtonText}>
            Wait {Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000))}s
          </Text>
        ) : (
          <Text style={alenioSheetStyles.primaryButtonText}>
            {mode === "create"
              ? createStep === 1
                ? "Continue"
                : "Start 14-Day Trial"
              : "Join workspace"}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          if (mode === "create" && createStep === 2) {
            setCreateStep(1);
            setError(null);
          } else {
            handleClose();
          }
        }}
        style={alenioSheetStyles.cancelButton}
        testID="onboarding-cancel"
        activeOpacity={0.8}
      >
        <Text style={alenioSheetStyles.cancelButtonText}>
          {mode === "create" && createStep === 2 ? "Back" : "Cancel"}
        </Text>
      </TouchableOpacity>
    </>
  );

  const modalBody = (
    <>
      {!isModeLocked ? (
        <ModeToggle
          mode={mode}
          onChange={(next) => {
            setMode(next);
            setCreateStep(1);
            setError(null);
          }}
        />
      ) : null}

      {mode === "create" && createStep === 1 ? (
        <AlenioSheetCard compact>
          <View style={[alenioSheetStyles.optionRow, alenioSheetStyles.optionRowCompact]}>
            <AlenioSheetIcon compact>
              <Building2 size={16} color="white" />
            </AlenioSheetIcon>
            <View style={{ flex: 1 }}>
              <Text style={[alenioSheetStyles.optionTitle, alenioSheetStyles.optionTitleCompact]}>Your workspace</Text>
              <Text style={[alenioSheetStyles.optionSubtitle, alenioSheetStyles.optionSubtitleCompact]}>
                Set up the shared space your team will use each day.
              </Text>
            </View>
          </View>
          <FieldLabel>Workspace name</FieldLabel>
          <TextInput
            style={alenioSheetStyles.fieldInput}
            placeholder="e.g. Retail Location #5427"
            placeholderTextColor="#94A3B8"
            value={teamName}
            onChangeText={(t) => {
              setTeamName(t);
              setError(null);
            }}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            testID="team-name-input"
          />
          <FieldLabel>Workspace logo (optional)</FieldLabel>
          <Pressable
            onPress={async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });
              if (!result.canceled && result.assets[0]) setLogoUri(result.assets[0].uri);
            }}
            style={styles.logoPicker}
            testID="workspace-logo-picker"
          >
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoPreview} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Camera size={18} color={WELCOME_UI.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.logoTitle}>{logoUri ? "Logo selected" : "Add a logo"}</Text>
              <Text style={styles.logoSubtitle}>You can change this later.</Text>
            </View>
          </Pressable>
          <FieldLabel>Industry</FieldLabel>
          <View style={styles.industryGrid}>
            {INDUSTRIES.map((value) => {
              const selected = industry === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    setIndustry(value);
                    setError(null);
                  }}
                  style={[styles.industryChip, selected ? styles.industryChipSelected : null]}
                  testID={`industry-${value.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Text style={[styles.industryText, selected ? styles.industryTextSelected : null]}>
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </AlenioSheetCard>
      ) : mode === "create" ? (
        <AlenioSheetCard tint="purple" compact>
          <View style={styles.trialHero}>
            <View style={styles.trialIcon}>
              <ShieldCheck size={24} color="white" />
            </View>
            <Text style={styles.trialEyebrow}>ALENIO OPERATIONS</Text>
            <Text style={styles.trialTitle}>14-day Operations trial</Text>
            <Text style={styles.trialSubtitle}>No credit card. No commitment. Your trial starts when you tap below.</Text>
          </View>
          {[
            { label: "Tasks, priorities, and team execution", comingSoon: false },
            { label: "Coaching, insights, and Seneca", comingSoon: false },
            { label: "Alenio Go: checklists and operational walks", comingSoon: true },
            { label: "Temperature checks and operations tools", comingSoon: true },
          ].map((feature) => (
            <View key={feature.label} style={styles.featureRow}>
              {feature.comingSoon ? (
                <Clock3 size={17} color="#D97706" />
              ) : (
                <CheckCircle2 size={17} color="#16A34A" />
              )}
              <Text style={styles.featureText}>{feature.label}</Text>
              {feature.comingSoon ? (
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>COMING SOON</Text>
                </View>
              ) : null}
            </View>
          ))}
          <View style={styles.trialNote}>
            <Text style={styles.trialNoteText}>
              After 14 days, existing content stays available in read-only mode until the workspace owner chooses a plan.
            </Text>
          </View>
        </AlenioSheetCard>
      ) : (
        <>
          <AlenioSheetCard tint="purple" compact>
            <View style={[alenioSheetStyles.optionRow, alenioSheetStyles.optionRowCompact]}>
              <AlenioSheetIcon color="#7C3AED" compact>
                <Users size={16} color="white" />
              </AlenioSheetIcon>
              <View style={{ flex: 1 }}>
                <Text style={[alenioSheetStyles.optionTitle, alenioSheetStyles.optionTitleCompact]}>Join with invite code</Text>
                <Text style={[alenioSheetStyles.optionSubtitle, alenioSheetStyles.optionSubtitleCompact]}>
                  Enter the code shared by your team admin.
                </Text>
              </View>
            </View>
            <FieldLabel>Invite code</FieldLabel>
            <TextInput
              ref={inviteCodeInputRef}
              style={[alenioSheetStyles.fieldInput, styles.codeInput]}
              placeholder="Enter invite code"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              textContentType="oneTimeCode"
              value={inviteCode}
              onChangeText={(t) => {
                setInviteCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, INVITE_CODE_MAX_LENGTH));
                setError(null);
              }}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              maxLength={INVITE_CODE_MAX_LENGTH}
              testID="invite-code-input"
            />
          </AlenioSheetCard>

          <TouchableOpacity onPress={openScanner} activeOpacity={0.92} testID="scan-qr-button">
            <AlenioSheetCard compact>
              <View style={[alenioSheetStyles.optionRow, alenioSheetStyles.optionRowCompact]}>
                <AlenioSheetIcon compact>
                  <ScanLine size={16} color="white" />
                </AlenioSheetIcon>
                <View style={{ flex: 1 }}>
                  <Text style={[alenioSheetStyles.optionTitle, alenioSheetStyles.optionTitleCompact]}>Scan QR code</Text>
                  <Text style={[alenioSheetStyles.optionSubtitle, alenioSheetStyles.optionSubtitleCompact]}>
                    Point at your team QR code to join automatically.
                  </Text>
                </View>
              </View>
            </AlenioSheetCard>
          </TouchableOpacity>
        </>
      )}

      {error ? (
        <View style={alenioSheetStyles.errorBox}>
          <Text style={alenioSheetStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <>
      <AlenioBottomSheet
        asScreen
        compact
        title={sheetTitle}
        subtitle={sheetSubtitle}
        onClose={handleClose}
        footer={sheetFooter}
        testID="onboarding-screen"
      >
        {modalBody}
      </AlenioBottomSheet>

      {/* QR Scanner Modal — unchanged */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => { setScannerOpen(false); scannedRef.current = false; }}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcodeScan}
          >
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}>
              {/* Header */}
              <View style={{ paddingTop: insets.top }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 }}>
                  <Pressable
                    onPress={() => { setScannerOpen(false); scannedRef.current = false; }}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}
                    testID="scanner-close"
                  >
                    <X size={20} color="white" />
                  </Pressable>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "white" }}>Scan QR Code</Text>
                  <View style={{ width: 40 }} />
                </View>
              </View>

              {/* Viewfinder */}
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 260, height: 260, position: "relative" }}>
                  {[{ top: 0, left: 0 }, { top: 0, right: 0 }, { bottom: 0, left: 0 }, { bottom: 0, right: 0 }].map((pos, i) => (
                    <View key={i} style={{
                      position: "absolute", width: 36, height: 36,
                      borderColor: WELCOME_UI.primary, borderWidth: 3,
                      borderTopWidth: (pos as any).bottom !== undefined ? 0 : 3,
                      borderBottomWidth: (pos as any).top !== undefined ? 0 : 3,
                      borderLeftWidth: (pos as any).right !== undefined ? 0 : 3,
                      borderRightWidth: (pos as any).left !== undefined ? 0 : 3,
                      borderRadius: 2, ...pos,
                    }} />
                  ))}
                  {joinMutation.isPending ? (
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                      <ActivityIndicator color={WELCOME_UI.primary} size="large" />
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Bottom card */}
              <View style={{ alignItems: "center", paddingBottom: insets.bottom + 40, paddingHorizontal: 40 }}>
                <View
                  style={{
                    borderRadius: 12,
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    alignItems: "center",
                    width: "100%",
                    backgroundColor: "rgba(255,255,255,0.12)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.2)",
                  }}
                >
                  <ScanLine size={18} color="white" />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "white", textAlign: "center", marginTop: 6 }}>
                    Point at an Alenio team QR code
                  </Text>
                  <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "center", marginTop: 4 }}>
                    You&apos;ll join automatically when it&apos;s detected
                  </Text>
                  <Pressable
                    onPress={() => { setScannerOpen(false); scannedRef.current = false; }}
                    style={{ marginTop: 12, paddingVertical: 6 }}
                    testID="scanner-enter-code-manually"
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#C4B5FD" }}>Enter code manually</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </CameraView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modeToggle: {
    flexDirection: "row",
    backgroundColor: WELCOME_UI.pageBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: WELCOME_UI.border,
    padding: 2,
  },
  modeOption: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 6,
  },
  modeOptionActive: {
    backgroundColor: WELCOME_UI.primary,
  },
  modeOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: WELCOME_UI.body,
  },
  modeOptionTextActive: {
    color: "#FFFFFF",
  },
  codeInput: {
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  logoPicker: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  logoPreview: { width: 42, height: 42, borderRadius: 10 },
  logoTitle: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  logoSubtitle: { fontSize: 11, color: "#64748B", marginTop: 2 },
  industryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  industryChip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF",
  },
  industryChipSelected: { borderColor: WELCOME_UI.primary, backgroundColor: "#EEF2FF" },
  industryText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  industryTextSelected: { color: WELCOME_UI.primary },
  trialHero: { alignItems: "center", paddingBottom: 12 },
  trialIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: WELCOME_UI.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  trialEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: "#6366F1" },
  trialTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A", marginTop: 4 },
  trialSubtitle: { fontSize: 12, lineHeight: 17, color: "#64748B", textAlign: "center", marginTop: 5 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 5 },
  featureText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#334155" },
  comingSoonBadge: {
    borderRadius: 999,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  comingSoonText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5, color: "#B45309" },
  trialNote: { marginTop: 10, borderRadius: 9, backgroundColor: "#F8FAFC", padding: 10 },
  trialNoteText: { fontSize: 11, lineHeight: 16, color: "#64748B", textAlign: "center" },
});
