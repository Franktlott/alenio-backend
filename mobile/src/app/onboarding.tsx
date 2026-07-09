import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Clock, ScanLine, X } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
type JoinResult =
  | { status: "pending"; teamName: string; requestId: string }
  | (Team & { status?: undefined });

type MineRequest = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
};

const UI = {
  pageBg: "#F1F5F9",
  headerBg: "#FAFBFF",
  headerBorder: "#E0E7FF",
  border: "#E2E8F0",
  muted: "#64748B",
  text: "#0F172A",
  subtext: "#475569",
  accent: "#4338CA",
  errorBg: "#FEF2F2",
  errorBorder: "#FECACA",
  errorText: "#B91C1C",
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden" as const,
  },
};

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "create" | "join";
  onChange: (mode: "create" | "join") => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderWidth: 1,
        borderColor: UI.border,
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      {(["create", "join"] as const).map((value) => {
        const selected = mode === value;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            testID={value === "create" ? "mode-create" : "mode-join"}
            style={{
              flex: 1,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: selected ? "#0F172A" : "#FFFFFF",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: selected ? "#FFFFFF" : "#64748B",
              }}
            >
              {value === "create" ? "Create" : "Join"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 6 }}>{children}</Text>
  );
}

const fieldInputStyle = {
  backgroundColor: "#FFFFFF",
  borderWidth: 1,
  borderColor: "#DCE3EB",
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 11,
  fontSize: 15,
  color: UI.text,
} as const;

export default function OnboardingScreen() {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const { intent, mode: modeParam } = useLocalSearchParams<{ intent?: string; mode?: string }>();
  const isAddFlow = intent === "add";
  const [mode, setMode] = useState<"create" | "join">(modeParam === "join" ? "join" : "create");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{
    requestId: string;
    teamName: string;
  } | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number>(0);
  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const insets = useSafeAreaInsets();

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

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
        setPendingRequest({
          requestId: result.requestId,
          teamName: result.teamName,
        });
      } else {
        const team = result as Team;
        setActiveTeamId(team.id);
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        if (isAddFlow && router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(app)/chat");
        }
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
      setError(rawMsg || "Invalid invite code. Please check and try again.");
    },
  });

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (scannedRef.current || joinMutation.isPending) return;
    const match = data.match(/alenio:\/\/join\/([A-Z0-9]+)/i) ?? data.match(/^([A-Z0-9]{6,10})$/i);
    if (!match) return;
    scannedRef.current = true;
    setScannerOpen(false);
    joinMutation.mutate(match[1]!.toUpperCase());
  };

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) return;
    }
    scannedRef.current = false;
    setScannerOpen(true);
  };

  // Poll for approval when in pending state
  useEffect(() => {
    if (!pendingRequest) return;

    const checkStatus = async () => {
      try {
        const requests = await api.get<MineRequest[]>("/api/join-requests/mine");
        const approved = requests.find((r) => r.status === "approved");
        if (approved) {
          setActiveTeamId(approved.team.id);
          queryClient.invalidateQueries({ queryKey: ["teams"] });
          router.replace("/(app)/chat");
        }
      } catch {
        // silently ignore polling errors
      }
    };

    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [pendingRequest, setActiveTeamId, queryClient]);

  const handleCheckStatus = async () => {
    if (!pendingRequest) return;
    setIsPolling(true);
    try {
      const requests = await api.get<MineRequest[]>("/api/join-requests/mine");
      const approved = requests.find((r) => r.status === "approved");
      if (approved) {
        setActiveTeamId(approved.team.id);
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        router.replace("/(app)/chat");
      }
    } catch {
      // ignore
    } finally {
      setIsPolling(false);
    }
  };

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
    router.replace("/(app)/chat");
  };

  const modalBody = pendingRequest ? (
    <>
      <View style={{ padding: 16, alignItems: "center" }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            backgroundColor: "#FFFBEB",
            borderWidth: 1,
            borderColor: "#FDE68A",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <Clock size={22} color="#D97706" />
        </View>
        <Text style={{ fontSize: 16, fontWeight: "700", color: UI.text, textAlign: "center" }}>Request sent</Text>
        <Text style={{ fontSize: 13, color: UI.muted, textAlign: "center", marginTop: 8, lineHeight: 19 }}>
          Your request to join{" "}
          <Text style={{ fontWeight: "600", color: UI.subtext }}>{pendingRequest.teamName}</Text> is pending review.
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: "#EEF2F6",
        }}
      >
        <Pressable
          onPress={() => {
            setPendingRequest(null);
            setInviteCode("");
            setError(null);
          }}
          style={{
            minWidth: 72,
            borderWidth: 1,
            borderColor: "#CBD5E1",
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            alignItems: "center",
            backgroundColor: "#FFFFFF",
          }}
          testID="cancel-pending-button"
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#334155" }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleCheckStatus}
          disabled={isPolling}
          style={{
            minWidth: 120,
            backgroundColor: UI.accent,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
            alignItems: "center",
          }}
          testID="check-status-button"
        >
          {isPolling ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>Check status</Text>
          )}
        </Pressable>
      </View>
    </>
  ) : (
    <>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 13, color: UI.muted, lineHeight: 19, marginBottom: 14 }}>
          {mode === "create"
            ? "Create a new workspace for your team."
            : "Enter an invite code or scan a QR code to join."}
        </Text>

        <ModeToggle
          mode={mode}
          onChange={(next) => {
            setMode(next);
            setError(null);
          }}
        />

        {mode === "create" ? (
          <>
            <FieldLabel>Workspace name</FieldLabel>
            <TextInput
              style={fieldInputStyle}
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
          </>
        ) : (
          <>
            <FieldLabel>Invite code</FieldLabel>
            <TextInput
              style={[fieldInputStyle, { letterSpacing: 2 }]}
              placeholder="e.g. ABC123"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={(t) => {
                setInviteCode(t.toUpperCase());
                setError(null);
              }}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              maxLength={6}
              testID="invite-code-input"
            />

            <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 14 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: UI.border }} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8", marginHorizontal: 10 }}>OR</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: UI.border }} />
            </View>

            <Pressable
              onPress={openScanner}
              style={{
                borderWidth: 1,
                borderColor: UI.border,
                backgroundColor: "#F8FAFC",
                borderRadius: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 11,
              }}
              testID="scan-qr-button"
            >
              <ScanLine size={16} color="#475569" />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#334155" }}>Scan QR code</Text>
            </Pressable>
          </>
        )}

        {error ? (
          <View
            style={{
              backgroundColor: UI.errorBg,
              borderRadius: 10,
              padding: 10,
              marginTop: 12,
              borderWidth: 1,
              borderColor: UI.errorBorder,
            }}
          >
            <Text style={{ fontSize: 13, color: UI.errorText, lineHeight: 18 }}>{error}</Text>
          </View>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: "#EEF2F6",
        }}
      >
        <Pressable
          onPress={handleClose}
          style={{
            minWidth: 72,
            borderWidth: 1,
            borderColor: "#CBD5E1",
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            alignItems: "center",
            backgroundColor: "#FFFFFF",
          }}
          testID="onboarding-cancel"
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#334155" }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={isLoading}
          style={{
            minWidth: mode === "create" ? 120 : 96,
            backgroundColor: UI.accent,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
            alignItems: "center",
            opacity: isLoading ? 0.7 : 1,
          }}
          testID="submit-button"
        >
          {createMutation.isPending || joinMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : isCoolingDown ? (
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>
              Wait {Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000))}s
            </Text>
          ) : (
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#FFFFFF" }}>
              {mode === "create" ? "Create" : "Join"}
            </Text>
          )}
        </Pressable>
      </View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }} testID="onboarding-screen">
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.4)",
          justifyContent: "center",
          paddingHorizontal: 20,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        }}
        onPress={handleClose}
      >
        <SafeKeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: UI.border,
                overflow: "hidden",
                width: "100%",
                maxWidth: 420,
                alignSelf: "center",
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
                  borderBottomColor: UI.border,
                  backgroundColor: "#F8FAFC",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 17, fontWeight: "700", color: UI.text }}>
                      {isAddFlow ? "Add workspace" : "Set up workspace"}
                    </Text>
                    <Text style={{ fontSize: 13, color: UI.muted, marginTop: 2 }}>
                      Create or join a workspace
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleClose}
                    hitSlop={12}
                    testID="onboarding-close"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: "#EEF2F6",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={18} color={UI.muted} />
                  </Pressable>
                </View>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
                {modalBody}
              </ScrollView>
            </View>
          </Pressable>
        </SafeKeyboardAvoidingView>
      </Pressable>

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
                      borderColor: "#7C3AED", borderWidth: 3,
                      borderTopWidth: (pos as any).bottom !== undefined ? 0 : 3,
                      borderBottomWidth: (pos as any).top !== undefined ? 0 : 3,
                      borderLeftWidth: (pos as any).right !== undefined ? 0 : 3,
                      borderRightWidth: (pos as any).left !== undefined ? 0 : 3,
                      borderRadius: 2, ...pos,
                    }} />
                  ))}
                  {joinMutation.isPending ? (
                    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                      <ActivityIndicator color="#7C3AED" size="large" />
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
                </View>
              </View>
            </View>
          </CameraView>
        </View>
      </Modal>
    </View>
  );
}
