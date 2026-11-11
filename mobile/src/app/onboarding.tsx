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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import {
  AlertCircle,
  Building2,
  Camera,
  CheckCircle2,
  Clock3,
  ScanLine,
  ShieldCheck,
  Users,
  X,
} from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api/api";
import { usePlans } from "@/lib/plans";
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
import {
  AlenioList,
  AlenioListRow,
  AppText,
  Button,
  Card,
  IconTile,
  PanelHeader,
  tintInk,
} from "@/components/ui";
import { palette } from "@/theme";
import { uploadFile } from "@/lib/upload";
import { BillingPortalWebViewModal } from "@/components/BillingPortalWebViewModal";
import { fetchMeUser, ME_QUERY_KEY } from "@/lib/auth/me-query";
import { isPlayCheckoutCanceled } from "@/lib/play-external-links";
import {
  createPaidWorkspaceCheckout,
  fetchPaidWorkspaceCheckout,
  workspaceCreationErrorMessage,
  type WorkspaceCheckoutPlan,
} from "@/lib/workspace-creation";

const INVITE_CODE_MAX_LENGTH = 12;
type JoinResult =
  | { status: "pending"; teamName: string; requestId: string }
  | (Team & { status?: undefined });
type JoinPreview = {
  id: string;
  name: string;
  image: string | null;
};

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
  const plans = usePlans();
  const { intent, mode: modeParam, focus: focusParam, action: actionParam, code: codeParam } = useLocalSearchParams<{
    intent?: string;
    mode?: string;
    focus?: string;
    action?: string;
    code?: string;
  }>();
  const isAddFlow = intent === "add";
  const isDirectCodeEntry =
    isAddFlow && modeParam === "join" && actionParam === "code";
  const isDirectScanner =
    isAddFlow && modeParam === "join" && actionParam === "scan";
  const initialCode =
    typeof codeParam === "string"
      ? codeParam.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, INVITE_CODE_MAX_LENGTH)
      : "";
  const [mode, setMode] = useState<"create" | "join">(modeParam === "join" || !!initialCode ? "join" : "create");
  const [teamName, setTeamName] = useState("");
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<WorkspaceCheckoutPlan>("pro");
  const [billingUrl, setBillingUrl] = useState<string | null>(null);
  const [paidCheckoutId, setPaidCheckoutId] = useState<string | null>(null);
  const [isFinalizingCheckout, setIsFinalizingCheckout] = useState(false);
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number>(0);
  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const insets = useSafeAreaInsets();
  const { data: me, isPending: isTrialEligibilityLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => fetchMeUser(),
    enabled: !!session?.user,
  });
  const canStartWorkspaceTrial = me?.canStartWorkspaceTrial !== false;

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedWorkspace, setScannedWorkspace] = useState<{
    code: string;
    team: JoinPreview;
  } | null>(null);
  const [scanPreviewError, setScanPreviewError] = useState<string | null>(null);
  const [requestSentTeamName, setRequestSentTeamName] = useState<string | null>(
    null,
  );
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

  const finishCreatedWorkspace = async (team: Team, access: "trial" | "paid") => {
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
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    router.replace({
      pathname: "/workspace-welcome",
      params: { teamId: team.id, teamName: team.name, access },
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (canStartWorkspaceTrial) {
        const team = await api.post<Team>("/api/teams", {
          name: teamName.trim(),
          startTrial: true,
        });
        return { kind: "trial" as const, team };
      }
      const checkout = await createPaidWorkspaceCheckout({
        name: teamName.trim(),
        plan: selectedPlan,
      });
      return { kind: "checkout" as const, checkout };
    },
    onSuccess: async (result) => {
      if (result.kind === "checkout") {
        setPaidCheckoutId(result.checkout.checkoutId);
        setBillingUrl(result.checkout.url);
        return;
      }
      await finishCreatedWorkspace(result.team, "trial");
    },
    onError: (err: unknown) => {
      if (isPlayCheckoutCanceled(err)) return;
      const rawMsg = err instanceof Error ? err.message : "";
      const code = (err as { body?: { error?: { code?: string } } } | null)?.body?.error?.code;
      if (code === "TRIAL_ALREADY_USED" || code === "PAID_PLAN_REQUIRED") {
        void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      }
      if (/too many requests|over.*rate.*limit|429/i.test(rawMsg)) {
        const waitMs = 20_000;
        setCooldownUntilMs(Date.now() + waitMs);
        setError("Too many requests right now. Please wait 20 seconds, then try again.");
        return;
      }
      setError(workspaceCreationErrorMessage(err));
    },
  });

  const finishPaidCheckout = async () => {
    if (!paidCheckoutId || isFinalizingCheckout) return;
    setIsFinalizingCheckout(true);
    setError(null);
    try {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const status = await fetchPaidWorkspaceCheckout(paidCheckoutId);
        if (status.status === "completed" && status.team) {
          await finishCreatedWorkspace(status.team, "paid");
          return;
        }
        if (status.status === "expired" || status.status === "failed") {
          throw new Error("Checkout did not complete. No workspace was created.");
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      throw new Error("Workspace setup is still finishing. Tap Check Workspace Status in a moment.");
    } catch (err) {
      setError(workspaceCreationErrorMessage(err));
    } finally {
      setIsFinalizingCheckout(false);
    }
  };

  const joinMutation = useMutation({
    mutationFn: (code: string) =>
      api.post<JoinResult>("/api/teams/join", {
        inviteCode: code,
      }),
    onSuccess: (result) => {
      if (result.status === "pending") {
        queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] });
        if (isDirectScanner) {
          setScannedWorkspace(null);
          setRequestSentTeamName(result.teamName);
          return;
        }
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
        router.replace("/(app)/home");
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
        if (isDirectScanner) {
          setRequestSentTeamName(
            scannedWorkspace?.team.name ?? "Workspace request",
          );
          setScannedWorkspace(null);
          return;
        }
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

  const previewJoinMutation = useMutation({
    mutationFn: (code: string) =>
      api.get<JoinPreview>(
        `/api/teams/join-preview/${encodeURIComponent(code)}`,
      ),
    onSuccess: (team, code) => {
      setScanPreviewError(null);
      setScannedWorkspace({ code, team });
    },
    onError: (err: unknown) => {
      scannedRef.current = false;
      setScanPreviewError(
        err instanceof Error
          ? err.message
          : "This workspace QR code could not be verified.",
      );
    },
  });

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (
      scannedRef.current ||
      joinMutation.isPending ||
      previewJoinMutation.isPending
    ) {
      return;
    }
    const match = data.match(/alenio:\/\/join\/([A-Z0-9]+)/i) ?? data.match(/^([A-Z0-9]{6,12})$/i);
    if (!match) return;
    const code = match[1]!.toUpperCase();
    scannedRef.current = true;
    setScannerOpen(false);
    setScanPreviewError(null);
    previewJoinMutation.mutate(code);
  };

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      Alert.alert(
        "Camera access needed",
        "Alenio uses your camera to scan workspace QR codes. You can also enter an invite code manually.",
        [
          {
            text: "Enter code manually",
            style: "cancel",
            onPress: () => {
              if (isDirectScanner) {
                router.replace({
                  pathname: "/onboarding",
                  params: {
                    intent: "add",
                    mode: "join",
                    action: "code",
                    focus: "code",
                  },
                });
              }
            },
          },
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
    if (
      mode !== "join" ||
      actionParam !== "scan" ||
      cameraPermission == null ||
      scanActionHandledRef.current
    ) {
      return;
    }
    scanActionHandledRef.current = true;
    void openScanner();
  }, [actionParam, cameraPermission, mode]);

  const isCoolingDown = Date.now() < cooldownUntilMs;
  const isLoading =
    createMutation.isPending ||
    joinMutation.isPending ||
    isFinalizingCheckout ||
    isCoolingDown ||
    (mode === "create" && isTrialEligibilityLoading);

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
      if (createStep === 1) {
        setCreateStep(2);
        return;
      }
      if (!canStartWorkspaceTrial && paidCheckoutId) {
        void finishPaidCheckout();
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

  const closeScanner = () => {
    setScannerOpen(false);
    scannedRef.current = false;
    if (isDirectScanner) handleClose();
  };

  const enterCodeFromScanner = () => {
    setScannerOpen(false);
    scannedRef.current = false;
    if (isDirectScanner) {
      router.replace({
        pathname: "/onboarding",
        params: {
          intent: "add",
          mode: "join",
          action: "code",
          focus: "code",
        },
      });
    }
  };

  const scanAgain = () => {
    setScannedWorkspace(null);
    setScanPreviewError(null);
    setRequestSentTeamName(null);
    scannedRef.current = false;
    setScannerOpen(true);
  };

  const isModeLocked = modeParam === "join" || modeParam === "create";

  const sheetTitle =
    mode === "create"
      ? createStep === 1
        ? "Create a workspace"
        : canStartWorkspaceTrial
          ? "Start your trial"
          : "Choose a plan"
      : isDirectCodeEntry
        ? "Join with invite code"
        : isDirectScanner
          ? "Scan workspace QR code"
          : isAddFlow
            ? "Add workplace"
        : "Join a workspace";
  const sheetSubtitle =
    mode === "create"
      ? createStep === 1
        ? "Tell us about your operation"
        : canStartWorkspaceTrial
          ? "14 days of Operations, no card required"
          : "Your workspace is created after secure checkout"
      : isDirectCodeEntry
        ? "Enter the code shared by your workspace."
        : isDirectScanner
          ? "Point your camera at a workspace invitation."
          : "Connect with your organization";

  const submitLabel = isCoolingDown
    ? `Wait ${Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000))}s`
    : mode === "create"
      ? createStep === 1
        ? "Continue"
        : canStartWorkspaceTrial
          ? "Start 14-Day Trial"
          : paidCheckoutId
            ? "Check Workspace Status"
            : "Continue to Secure Checkout"
      : "Join workspace";

  const sheetFooter = (
    <>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        label={submitLabel}
        loading={createMutation.isPending || joinMutation.isPending || isFinalizingCheckout}
        disabled={isLoading || isCoolingDown}
        onPress={handleSubmit}
        testID="submit-button"
      />
      {mode === "create" && createStep === 2 ? (
        <Button
          variant="ghost"
          size="md"
          fullWidth
          label="Back"
          onPress={() => {
            setCreateStep(1);
            setError(null);
          }}
          testID="onboarding-back"
        />
      ) : null}
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
        </AlenioSheetCard>
      ) : mode === "create" && canStartWorkspaceTrial ? (
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
      ) : mode === "create" ? (
        <AlenioSheetCard tint="purple" compact>
          <View style={styles.trialHero}>
            <View style={styles.trialIcon}>
              <ShieldCheck size={24} color="white" />
            </View>
            <Text style={styles.trialEyebrow}>PLAN REQUIRED</Text>
            <Text style={styles.trialTitle}>Choose your workspace plan</Text>
            <Text style={styles.trialSubtitle}>
              Your free trial was used previously. Nothing is created or charged until secure checkout succeeds.
            </Text>
          </View>
          {([
            {
              id: "pro",
              name: plans.pro.name,
              price: `${plans.pro.priceLabel} / ${plans.pro.interval}`,
              detail: "Tasks, calendars, coaching, insights, and Seneca",
            },
            {
              id: "operations",
              name: plans.operations.name,
              price: `${plans.operations.priceLabel} / ${plans.operations.interval}`,
              detail: `Everything in ${plans.pro.name}, plus Alenio Go operations tools`,
            },
          ] as const).map((plan) => {
            const selected = selectedPlan === plan.id;
            return (
              <Pressable
                key={plan.id}
                onPress={() => setSelectedPlan(plan.id)}
                style={[styles.paidPlanCard, selected ? styles.paidPlanCardSelected : null]}
                accessibilityState={{ selected }}
                testID={`workspace-plan-${plan.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.paidPlanName}>{plan.name}</Text>
                  <Text style={styles.paidPlanDetail}>{plan.detail}</Text>
                  <Text style={styles.paidPlanPrice}>{plan.price}</Text>
                </View>
                <View style={[styles.planRadio, selected ? styles.planRadioSelected : null]}>
                  {selected ? <CheckCircle2 size={16} color="white" /> : null}
                </View>
              </Pressable>
            );
          })}
        </AlenioSheetCard>
      ) : (
        <>
          <Card>
            <PanelHeader
              tint="lavender"
              icon={<Users size={16} color={tintInk("lavender")} strokeWidth={2.2} />}
              title="Join with invite code"
              subtitle="Enter the code shared by your team admin."
              style={{ marginBottom: 12 }}
            />
            <AppText variant="sectionLabel" color={palette.violet} style={{ marginBottom: 6 }}>
              Invite code
            </AppText>
            <TextInput
              ref={inviteCodeInputRef}
              style={styles.joinCodeInput}
              placeholder="E.G. L7MGHETS"
              placeholderTextColor={palette.inkMuted}
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
            <AppText variant="supporting" style={{ marginTop: 6 }}>
              Codes are letters and numbers only
            </AppText>
          </Card>

          {!isDirectCodeEntry ? (
            <View style={styles.scanListWrap}>
              <AlenioList>
                <AlenioListRow
                  leading={
                    <IconTile tint="lavender">
                      <ScanLine size={16} color={tintInk("lavender")} strokeWidth={2.2} />
                    </IconTile>
                  }
                  title="Scan QR code"
                  subtitle="Point at your team QR code to join automatically."
                  onPress={openScanner}
                  chevron
                  testID="scan-qr-button"
                />
              </AlenioList>
            </View>
          ) : null}
        </>
      )}

      {error ? (
        <View style={styles.joinErrorBox}>
          <View style={styles.joinErrorIcon}>
            <AlertCircle size={14} color="#DC2626" strokeWidth={2.2} />
          </View>
          <View style={styles.joinErrorCopy}>
            <AppText variant="rowTitle" color="#B91C1C">
              We couldn’t find that workspace
            </AppText>
            <AppText variant="supporting" color="#C24141" style={{ marginTop: 2 }}>
              {error}
            </AppText>
          </View>
        </View>
      ) : null}
    </>
  );

  const directScannerContent = requestSentTeamName ? (
    <AlenioBottomSheet
      asScreen
      compact
      title="Request sent"
      subtitle="Workspace leaders can now review your request."
      onClose={handleClose}
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          label="Done"
          onPress={handleClose}
          testID="join-request-sent-done"
        />
      }
      testID="join-request-sent-sheet"
    >
      <AlenioSheetCard tint="purple" compact>
        <View style={styles.scanResultContent}>
          <View style={styles.scanSuccessIcon}>
            <CheckCircle2 size={27} color="#FFFFFF" strokeWidth={2.4} />
          </View>
          <Text style={styles.scanResultEyebrow}>REQUEST DELIVERED</Text>
          <Text style={styles.scanResultTitle}>{requestSentTeamName}</Text>
          <Text style={styles.scanResultBody}>
            Your request is waiting for approval. You’ll see the workspace after
            a leader approves it.
          </Text>
        </View>
      </AlenioSheetCard>
    </AlenioBottomSheet>
  ) : scannedWorkspace ? (
    <AlenioBottomSheet
      asScreen
      compact
      title="Confirm workspace"
      subtitle="Make sure this is the workspace you want to join."
      onClose={handleClose}
      footer={
        <>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            label={joinMutation.isPending ? "Sending request…" : "Send join request"}
            loading={joinMutation.isPending}
            disabled={joinMutation.isPending}
            onPress={() => {
              setError(null);
              joinMutation.mutate(scannedWorkspace.code);
            }}
            testID="confirm-scanned-workspace"
          />
          <Button
            variant="ghost"
            size="md"
            fullWidth
            label="Scan a different code"
            disabled={joinMutation.isPending}
            onPress={scanAgain}
          />
        </>
      }
      testID="confirm-scanned-workspace-sheet"
    >
      <AlenioSheetCard compact>
        <View style={styles.scannedWorkspaceRow}>
          {scannedWorkspace.team.image ? (
            <Image
              source={{ uri: scannedWorkspace.team.image }}
              style={styles.scannedWorkspaceImage}
            />
          ) : (
            <View style={styles.scannedWorkspaceFallback}>
              <Building2 size={22} color="#5368E8" strokeWidth={2.1} />
            </View>
          )}
          <View style={styles.scannedWorkspaceCopy}>
            <Text style={styles.scanResultEyebrow}>WORKSPACE FOUND</Text>
            <Text style={styles.scannedWorkspaceName} numberOfLines={2}>
              {scannedWorkspace.team.name}
            </Text>
            <Text style={styles.scannedWorkspaceNote}>
              A leader must approve your request.
            </Text>
          </View>
        </View>
      </AlenioSheetCard>
      {error ? (
        <View style={alenioSheetStyles.errorBox}>
          <Text style={alenioSheetStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </AlenioBottomSheet>
  ) : scanPreviewError ? (
    <AlenioBottomSheet
      asScreen
      compact
      title="QR code not recognized"
      subtitle="This code could not be matched to an Alenio workspace."
      onClose={handleClose}
      footer={
        <>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            label="Scan again"
            onPress={scanAgain}
          />
          <Button
            variant="ghost"
            size="md"
            fullWidth
            label="Enter code manually"
            onPress={enterCodeFromScanner}
          />
        </>
      }
    >
      <View style={alenioSheetStyles.errorBox}>
        <Text style={alenioSheetStyles.errorText}>{scanPreviewError}</Text>
      </View>
    </AlenioBottomSheet>
  ) : previewJoinMutation.isPending ? (
    <View style={styles.scanLookupScreen}>
      <ActivityIndicator color={WELCOME_UI.primary} size="large" />
      <Text style={styles.scanLookupTitle}>Confirming workspace…</Text>
      <Text style={styles.scanLookupBody}>
        Checking the invitation before anything is sent.
      </Text>
    </View>
  ) : (
    <View style={styles.scannerLaunchScreen} />
  );

  return (
    <>
      {isDirectScanner ? (
        directScannerContent
      ) : (
        <AlenioBottomSheet
          asScreen
          compact
          title={sheetTitle}
          subtitle={sheetSubtitle}
          onClose={handleClose}
          showCloseButton
          footer={sheetFooter}
          testID="onboarding-screen"
        >
          {modalBody}
        </AlenioBottomSheet>
      )}

      <BillingPortalWebViewModal
        visible={!!billingUrl}
        url={billingUrl}
        workspaceName={teamName.trim()}
        onClose={() => setBillingUrl(null)}
        onFlowComplete={(result) => {
          if (result === "success") {
            void finishPaidCheckout();
          } else {
            setPaidCheckoutId(null);
            setError("Checkout was canceled. No workspace was created.");
          }
        }}
      />

      {/* QR Scanner Modal — unchanged */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={closeScanner}>
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
                    onPress={closeScanner}
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
                    onPress={enterCodeFromScanner}
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
  scannerLaunchScreen: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scanLookupScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "#FFFFFF",
  },
  scanLookupTitle: {
    marginTop: 16,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: "#172033",
  },
  scanLookupBody: {
    marginTop: 5,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    color: "#7C8798",
  },
  scannedWorkspaceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  scannedWorkspaceImage: {
    width: 58,
    height: 58,
    borderRadius: 15,
    backgroundColor: "#EEF2F7",
  },
  scannedWorkspaceFallback: {
    width: 58,
    height: 58,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#DDE3FF",
  },
  scannedWorkspaceCopy: {
    flex: 1,
    minWidth: 0,
  },
  scannedWorkspaceName: {
    marginTop: 2,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    color: "#111827",
  },
  scannedWorkspaceNote: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    color: "#7C8798",
  },
  scanResultContent: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  scanSuccessIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4361EE",
  },
  scanResultEyebrow: {
    marginTop: 10,
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#6D4AE8",
  },
  scanResultTitle: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
    color: "#111827",
  },
  scanResultBody: {
    maxWidth: 285,
    marginTop: 7,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    color: "#7C8798",
  },
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
  joinCodeInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E0EF",
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: palette.ink,
  },
  scanListWrap: {
    marginTop: 10,
  },
  joinErrorBox: {
    marginTop: 11,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FED7D7",
    backgroundColor: "#FFF7F7",
  },
  joinErrorIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
  },
  joinErrorCopy: {
    flex: 1,
    minWidth: 0,
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
  paidPlanCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    marginTop: 9,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  paidPlanCardSelected: { borderColor: WELCOME_UI.primary, backgroundColor: "#EEF2FF" },
  paidPlanName: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  paidPlanDetail: { marginTop: 3, fontSize: 11, lineHeight: 16, color: "#64748B" },
  paidPlanPrice: { marginTop: 6, fontSize: 12, fontWeight: "700", color: WELCOME_UI.primary },
  planRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  planRadioSelected: { borderColor: WELCOME_UI.primary, backgroundColor: WELCOME_UI.primary },
});
