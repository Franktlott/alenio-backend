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
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeft, Clock, ScanLine, X } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";

type JoinResult =
  | { status: "pending"; teamName: string; requestId: string }
  | (Team & { status?: undefined });

type MineRequest = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
};

export default function OnboardingScreen() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{
    requestId: string;
    teamName: string;
  } | null>(null);
  const [isPolling, setIsPolling] = useState(false);

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

  const createMutation = useMutation({
    mutationFn: () => api.post<Team>("/api/teams", { name: teamName }),
    onSuccess: (team) => {
      setActiveTeamId(team.id);
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      router.replace("/(app)");
    },
    onError: () => setError("Failed to create team. Please try again."),
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
        router.replace("/(app)");
      }
    },
    onError: () => setError("Invalid invite code. Please check and try again."),
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
          router.replace("/(app)");
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
        router.replace("/(app)");
      }
    } catch {
      // ignore
    } finally {
      setIsPolling(false);
    }
  };

  const isLoading = createMutation.isPending || joinMutation.isPending;

  const handleSubmit = () => {
    setError(null);
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

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      edges={["top"]}
      testID="onboarding-screen"
    >
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View>
            <Text className="text-white text-xl font-bold">
              {alreadyOwnsTeam ? "Join a team" : "Set up your team"}
            </Text>
            <Text className="text-white/70 text-sm">
              {alreadyOwnsTeam ? "Enter an invite code to join a workspace" : "Create or join a workspace"}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {pendingRequest ? (
        // Pending approval UI
        <View className="flex-1 px-6 justify-center items-center">
          <View
            className="w-20 h-20 rounded-full bg-amber-100 items-center justify-center mb-6"
          >
            <Clock size={40} color="#F59E0B" />
          </View>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-3 text-center">
            Request Sent!
          </Text>
          <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mb-8 leading-5">
            Your request to join{" "}
            <Text className="font-semibold text-slate-700 dark:text-slate-200">
              {pendingRequest.teamName}
            </Text>{" "}
            has been sent. The Team Leader will review it.
          </Text>

          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 px-8 items-center mb-3 w-full"
            onPress={handleCheckStatus}
            disabled={isPolling}
            testID="check-status-button"
          >
            {isPolling ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Check Status</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="py-3 items-center w-full"
            onPress={() => {
              setPendingRequest(null);
              setInviteCode("");
              setError(null);
            }}
            testID="cancel-pending-button"
          >
            <Text className="text-slate-400 text-sm">Cancel / Try different code</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Normal create/join form
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <View className="flex-1 px-6 justify-center">
            {/* Mode toggle — hidden entirely when user already owns a team */}
            {!alreadyOwnsTeam && (
              <View className="flex-row bg-slate-200 dark:bg-slate-700 rounded-xl p-1 mb-6">
                <TouchableOpacity
                  onPress={() => {
                    setMode("create");
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg items-center ${
                    mode === "create" ? "bg-white dark:bg-slate-800" : ""
                  }`}
                  testID="mode-create"
                >
                  <Text
                    className={`font-semibold text-sm ${
                      mode === "create" ? "text-indigo-600" : "text-slate-500"
                    }`}
                  >
                    Create team
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setMode("join");
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg items-center ${
                    mode === "join" ? "bg-white dark:bg-slate-800" : ""
                  }`}
                  testID="mode-join"
                >
                  <Text
                    className={`font-semibold text-sm ${
                      mode === "join" ? "text-indigo-600" : "text-slate-500"
                    }`}
                  >
                    Join team
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === "create" ? (
              <View>
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Team name
                </Text>
                <TextInput
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
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
              </View>
            ) : (
              <View>
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Invite code
                </Text>
                <TextInput
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white tracking-widest"
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
              </View>
            )}

            {/* Scan QR button — only in join mode */}
            {mode === "join" ? (
              <Pressable
                onPress={openScanner}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: "#7C3AED40", backgroundColor: "#7C3AED0D" }}
                testID="scan-qr-button"
              >
                <ScanLine size={18} color="#7C3AED" />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#7C3AED" }}>Scan QR Code to Join</Text>
              </Pressable>
            ) : null}

            {error ? (
              <Text className="text-red-500 text-sm mt-2">{error}</Text>
            ) : null}

            <TouchableOpacity
              className="bg-indigo-600 rounded-xl py-4 items-center mt-4"
              onPress={handleSubmit}
              disabled={isLoading}
              testID="submit-button"
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {mode === "create" ? "Create team" : "Join team"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="mt-3 items-center"
              onPress={() => router.back()}
            >
              <Text className="text-slate-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* QR Scanner Modal */}
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
    </SafeAreaView>
  );
}
