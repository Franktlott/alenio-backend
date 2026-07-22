import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScanLine, Building2, Users, X } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
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

const INVITE_CODE_MAX_LENGTH = 12;
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
    mutationFn: () => api.post<Team>("/api/teams", { name: teamName }),
    onSuccess: async (team) => {
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
        setError("Please enter a team name");
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
    isAddFlow ? "Add workplace" : mode === "create" ? "Create a workplace" : "Join a workspace";
  const sheetSubtitle =
    mode === "create" ? "Set up a new team space" : "Connect with your organization";

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
            {mode === "create" ? "Create workplace" : "Join workspace"}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleClose}
        style={alenioSheetStyles.cancelButton}
        testID="onboarding-cancel"
        activeOpacity={0.8}
      >
        <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
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
            setError(null);
          }}
        />
      ) : null}

      {mode === "create" ? (
        <AlenioSheetCard compact>
          <View style={[alenioSheetStyles.optionRow, alenioSheetStyles.optionRowCompact]}>
            <AlenioSheetIcon compact>
              <Building2 size={16} color="white" />
            </AlenioSheetIcon>
            <View style={{ flex: 1 }}>
              <Text style={[alenioSheetStyles.optionTitle, alenioSheetStyles.optionTitleCompact]}>New workplace</Text>
              <Text style={[alenioSheetStyles.optionSubtitle, alenioSheetStyles.optionSubtitleCompact]}>
                Create a team space for your organization.
              </Text>
            </View>
          </View>
          <FieldLabel>Workplace name</FieldLabel>
          <TextInput
            style={alenioSheetStyles.fieldInput}
            placeholder="e.g. Engineering, Marketing"
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
});
