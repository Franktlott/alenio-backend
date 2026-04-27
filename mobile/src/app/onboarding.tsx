import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeft, Clock, ScanLine, X, Users, Link2 } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";
import { runSignInDiagnostics } from "@/lib/sign-in-diagnostics";
import { useSession } from "@/lib/auth/use-session";

type JoinResult =
  | { status: "pending"; teamName: string; requestId: string }
  | (Team & { status?: undefined });

type MineRequest = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
};

const cardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

export default function OnboardingScreen() {
  const { data: session, isLoading: isSessionLoading } = useSession();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{
    requestId: string;
    teamName: string;
  } | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number>(0);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagReport, setDiagReport] = useState<string>("");

  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const insets = useSafeAreaInsets();

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const { data: existingTeams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<any[]>("/api/teams"),
  });
  const alreadyOwnsTeam = existingTeams.some((t: any) => t.role === "owner");

  useEffect(() => {
    if (alreadyOwnsTeam) setMode("join");
  }, [alreadyOwnsTeam]);

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
    onSuccess: (team) => {
      setActiveTeamId(team.id);
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      router.replace("/(app)/team");
    },
    onError: (err: unknown) => {
      const rawMsg = err instanceof Error ? err.message : "";
      if (/too many requests|over.*rate.*limit|429/i.test(rawMsg)) {
        const waitMs = 20_000;
        setCooldownUntilMs(Date.now() + waitMs);
        setError("Too many requests right now. Please wait 20 seconds, then try again.");
        return;
      }
      const isOwnerLimit =
        /already own a team/i.test(rawMsg) ||
        /team_limit_reached/i.test(rawMsg) ||
        /request failed:\s*400/i.test(rawMsg);
      if (isOwnerLimit) {
        setMode("join");
        setError("You already own a team. Use Join team to connect to another workspace.");
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
        router.replace("/(app)/team");
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
          router.replace("/(app)/team");
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
        router.replace("/(app)/team");
      }
    } catch {
      // ignore
    } finally {
      setIsPolling(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setDiagOpen(true);
    setDiagLoading(true);
    setDiagReport("");
    try {
      const report = await runSignInDiagnostics();
      setDiagReport(report);
    } catch (e) {
      setDiagReport(`Diagnostics failed:\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDiagLoading(false);
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
      if (alreadyOwnsTeam) {
        setMode("join");
        setError("You already own a team. Use Join team to connect to another workspace.");
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

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F0F2FF" }}
      edges={["top"]}
      testID="onboarding-screen"
    >
      {/* Gradient header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View>
            <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>
              {alreadyOwnsTeam ? "Join a team" : "Set up your team"}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
              {alreadyOwnsTeam ? "Enter a code or scan to join your team" : "Create or join a workspace"}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {pendingRequest ? (
            // Pending approval card
            <View
              style={[
                {
                  backgroundColor: "white",
                  borderRadius: 24,
                  padding: 28,
                  alignItems: "center",
                },
                cardShadow,
              ]}
            >
              <View
                style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", marginBottom: 20 }}
              >
                <Clock size={40} color="#F59E0B" />
              </View>
              <Text style={{ fontSize: 22, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 10 }}>
                Request Sent!
              </Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                Your request to join{" "}
                <Text style={{ fontWeight: "600", color: "#334155" }}>
                  {pendingRequest.teamName}
                </Text>{" "}
                has been sent. The Team Leader will review it.
              </Text>

              <TouchableOpacity
                style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 15, alignItems: "center", width: "100%", marginBottom: 12 }}
                onPress={handleCheckStatus}
                disabled={isPolling}
                testID="check-status-button"
              >
                {isPolling ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>Check Status</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ paddingVertical: 10, alignItems: "center", width: "100%" }}
                onPress={() => {
                  setPendingRequest(null);
                  setInviteCode("");
                  setError(null);
                }}
                testID="cancel-pending-button"
              >
                <Text style={{ color: "#94A3B8", fontSize: 13 }}>Cancel / Try different code</Text>
              </TouchableOpacity>
            </View>
          ) : mode === "join" || alreadyOwnsTeam ? (
            // Join mode card
            <View
              style={[
                {
                  backgroundColor: "white",
                  borderRadius: 24,
                  padding: 28,
                },
                cardShadow,
              ]}
            >
              {/* Illustration area */}
              <View style={{ backgroundColor: "#EEF0FF", borderRadius: 16, height: 100, width: "100%", alignItems: "center", justifyContent: "center", position: "relative" }}>
                <Users size={48} color="#4361EE" />
                <View style={{ position: "absolute", bottom: 10, right: 12 }}>
                  <Link2 size={20} color="#7C3AED" />
                </View>
              </View>

              <Text style={{ fontSize: 22, fontWeight: "700", color: "#0F172A", textAlign: "center", marginTop: 16 }}>
                Join a team
              </Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", marginTop: 4, marginBottom: 20 }}>
                Enter a code or scan to join your team
              </Text>

              {/* Mode toggle — only shown when user does not already own a team */}
              {!alreadyOwnsTeam && (
                <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", borderRadius: 12, padding: 4, marginBottom: 20 }}>
                  <TouchableOpacity
                    onPress={() => { setMode("create"); setError(null); }}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: mode === "create" ? "white" : "transparent" }}
                    testID="mode-create"
                  >
                    <Text style={{ fontWeight: "600", fontSize: 13, color: mode === "create" ? "#4361EE" : "#94A3B8" }}>
                      Create team
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setMode("join"); setError(null); }}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: mode === "join" ? "white" : "transparent" }}
                    testID="mode-join"
                  >
                    <Text style={{ fontWeight: "600", fontSize: 13, color: mode === "join" ? "#4361EE" : "#94A3B8" }}>
                      Join team
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Invite code label + input */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                Invite Code
              </Text>
              <TextInput
                style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", letterSpacing: 2 }}
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

              {/* OR divider */}
              <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 14 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
                <Text style={{ fontSize: 12, color: "#94A3B8", marginHorizontal: 10 }}>OR</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
              </View>

              {/* Scan QR Code button */}
              <Pressable
                onPress={openScanner}
                style={{ borderWidth: 1.5, borderColor: "#7C3AED", backgroundColor: "#7C3AED12", borderRadius: 14, width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13 }}
                testID="scan-qr-button"
              >
                <ScanLine size={18} color="#7C3AED" />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#7C3AED" }}>Scan QR Code</Text>
              </Pressable>

              {error ? (
                <Text style={{ color: "#EF4444", fontSize: 13, marginTop: 8 }}>{error}</Text>
              ) : null}

              {/* Join Team button */}
              <TouchableOpacity
                style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 15, alignItems: "center", width: "100%", marginTop: 12 }}
                onPress={handleSubmit}
                disabled={isLoading}
                testID="submit-button"
              >
                {joinMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : isCoolingDown ? (
                  <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>
                    Please wait {Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000))}s
                  </Text>
                ) : (
                  <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>Join Team</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 12, alignItems: "center" }}
                onPress={() => router.back()}
              >
                <Text style={{ color: "#94A3B8", fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // Create mode card
            <View
              style={[
                {
                  backgroundColor: "white",
                  borderRadius: 24,
                  padding: 28,
                },
                cardShadow,
              ]}
            >
              <Text style={{ fontSize: 22, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 4 }}>
                Create a team
              </Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 20 }}>
                Create or join a workspace
              </Text>

              {/* Mode toggle */}
              <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", borderRadius: 12, padding: 4, marginBottom: 20 }}>
                <TouchableOpacity
                  onPress={() => { setMode("create"); setError(null); }}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: mode === "create" ? "white" : "transparent" }}
                  testID="mode-create"
                >
                  <Text style={{ fontWeight: "600", fontSize: 13, color: mode === "create" ? "#4361EE" : "#94A3B8" }}>
                    Create team
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setMode("join"); setError(null); }}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: "transparent" }}
                  testID="mode-join"
                >
                  <Text style={{ fontWeight: "600", fontSize: 13, color: "#94A3B8" }}>
                    Join team
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                Team Name
              </Text>
              <TextInput
                style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A" }}
                placeholder="e.g. Engineering, Marketing..."
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

              {error ? (
                <Text style={{ color: "#EF4444", fontSize: 13, marginTop: 8 }}>{error}</Text>
              ) : null}

              <TouchableOpacity
                style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 15, alignItems: "center", width: "100%", marginTop: 12 }}
                onPress={handleSubmit}
                disabled={isLoading}
                testID="submit-button"
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : isCoolingDown ? (
                  <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>
                    Please wait {Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000))}s
                  </Text>
                ) : (
                  <Text style={{ color: "white", fontWeight: "600", fontSize: 15 }}>Create Team</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 12, alignItems: "center" }}
                onPress={() => router.back()}
              >
                <Text style={{ color: "#94A3B8", fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          <Pressable
            style={{
              marginTop: 16,
              borderWidth: 1,
              borderColor: "#CBD5E1",
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 12,
              backgroundColor: "white",
            }}
            onPress={handleRunDiagnostics}
            disabled={diagLoading}
            testID="onboarding-diagnostics-button"
          >
            <Text style={{ color: "#475569", fontSize: 13, fontWeight: "600", textAlign: "center" }}>
              Diagnose connection
            </Text>
            <Text style={{ color: "#94A3B8", fontSize: 12, textAlign: "center", marginTop: 4 }}>
              Check auth, backend, database, and push setup
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

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
                <LinearGradient
                  colors={["#4361EE", "#7C3AED"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, alignItems: "center", width: "100%" }}
                >
                  <ScanLine size={20} color="white" />
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "white", textAlign: "center", marginTop: 6 }}>Point at an Alenio team QR code</Text>
                  <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "center", marginTop: 4 }}>You'll join automatically when it's detected</Text>
                </LinearGradient>
              </View>
            </View>
          </CameraView>
        </View>
      </Modal>

      <Modal
        visible={diagOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setDiagOpen(false)}
        testID="onboarding-diagnostics-modal"
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
          onPress={() => setDiagOpen(false)}
          testID="onboarding-diagnostics-backdrop"
        >
          <Pressable
            style={{
              backgroundColor: "white",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "85%",
              borderTopWidth: 1,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: "#E2E8F0",
            }}
            onPress={(ev) => ev.stopPropagation()}
          >
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: "#E2E8F0" }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: "#0F172A" }}>
                Connection diagnostics
              </Text>
              <Text style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>
                Use this report for support if auth or team setup fails.
              </Text>
            </View>
            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16 }}
              keyboardShouldPersistTaps="handled"
              testID="onboarding-diagnostics-scroll"
            >
              {diagLoading ? (
                <View style={{ paddingVertical: 48, alignItems: "center" }} testID="onboarding-diagnostics-loading">
                  <ActivityIndicator size="large" color="#6366F1" />
                  <Text style={{ color: "#64748B", fontSize: 13, marginTop: 14 }}>Running checks...</Text>
                </View>
              ) : (
                <Text
                  style={{ fontSize: 12, lineHeight: 18, color: "#1E293B", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                  selectable
                  testID="onboarding-diagnostics-report"
                >
                  {diagReport || "—"}
                </Text>
              )}
            </ScrollView>
            <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 8 }}>
              <Pressable
                style={{ backgroundColor: "#4F46E5", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                onPress={() => setDiagOpen(false)}
                testID="onboarding-diagnostics-close"
              >
                <Text style={{ color: "white", fontWeight: "600" }}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
