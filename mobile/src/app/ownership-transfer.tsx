import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Check, Crown, Shield } from "lucide-react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSession } from "@/lib/auth/use-session";
import { completeOwnershipTransferPayment } from "@/lib/ownership-transfer-api";

type Status = "working" | "done" | "needs_card" | "canceled" | "error";

const HOLD_MS = 6000;

function paramOne(v: string | string[] | undefined): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim();
  return "";
}

function OwnershipSuccessMoment({ teamName }: { teamName: string | null }) {
  const scale = useSharedValue(0.55);
  const ring = useSharedValue(0.85);
  const glow = useSharedValue(0.35);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 11, stiffness: 140, mass: 0.85 });
    ring.value = withDelay(
      180,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.92, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    glow.value = withDelay(
      120,
      withRepeat(
        withSequence(
          withTiming(0.7, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.28, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [glow, ring, scale]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring.value }],
    opacity: 0.45,
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: 0.9 + glow.value * 0.25 }],
  }));

  return (
    <LinearGradient
      colors={["#1B2A6B", "#4361EE", "#7C3AED"]}
      locations={[0, 0.48, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{ flex: 1, paddingHorizontal: 28, justifyContent: "center", alignItems: "center" }}
          testID="ownership-transfer-success"
        >
          <View style={{ width: 168, height: 168, alignItems: "center", justifyContent: "center" }}>
            <Animated.View
              style={[
                {
                  position: "absolute",
                  width: 168,
                  height: 168,
                  borderRadius: 84,
                  backgroundColor: "rgba(255,255,255,0.16)",
                },
                glowStyle,
              ]}
            />
            <Animated.View
              style={[
                {
                  position: "absolute",
                  width: 132,
                  height: 132,
                  borderRadius: 66,
                  borderWidth: 1.5,
                  borderColor: "rgba(255,255,255,0.55)",
                },
                ringStyle,
              ]}
            />
            <Animated.View
              style={[
                {
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#0F172A",
                  shadowOpacity: 0.28,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 8,
                },
                badgeStyle,
              ]}
            >
              <View style={{ position: "absolute", top: 14, right: 16 }}>
                <Crown size={18} color="#F59E0B" fill="#FBBF24" strokeWidth={2} />
              </View>
              <Check size={44} color="#4361EE" strokeWidth={3} />
            </Animated.View>
          </View>

          <Animated.Text
            entering={FadeInDown.delay(160).duration(520)}
            style={{
              marginTop: 36,
              fontSize: 13,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.72)",
              textAlign: "center",
            }}
          >
            Ownership transferred
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.delay(280).duration(560)}
            style={{
              marginTop: 12,
              fontSize: 34,
              lineHeight: 40,
              fontWeight: "800",
              color: "#FFFFFF",
              textAlign: "center",
              letterSpacing: -0.6,
            }}
          >
            You’re the new owner
          </Animated.Text>

          <Animated.Text
            entering={FadeInUp.delay(420).duration(560)}
            style={{
              marginTop: 14,
              fontSize: 16,
              lineHeight: 24,
              color: "rgba(255,255,255,0.82)",
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            {teamName
              ? `${teamName} is yours to lead — billing is on your card, and the team is ready.`
              : "This workspace is yours to lead — billing is on your card, and the team is ready."}
          </Animated.Text>

          <Animated.View
            entering={FadeIn.delay(700).duration(500)}
            style={{
              marginTop: 28,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.14)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.22)",
            }}
          >
            <Shield size={15} color="#FFFFFF" strokeWidth={2.25} />
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>
              Full workspace control unlocked
            </Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

/**
 * Deep link: alenio://ownership-transfer?teamId&transferId&billing&session_id
 * Opened after Stripe Checkout via backend /open-ownership-transfer bridge.
 */
export default function OwnershipTransferReturnScreen() {
  const params = useLocalSearchParams<{
    teamId?: string | string[];
    transferId?: string | string[];
    billing?: string | string[];
    session_id?: string | string[];
    celebrate?: string | string[];
    teamName?: string | string[];
  }>();
  const teamId = paramOne(params.teamId);
  const transferId = paramOne(params.transferId);
  const billing = paramOne(params.billing);
  const sessionId = paramOne(params.session_id);
  const celebrate = paramOne(params.celebrate) === "1";
  const teamNameParam = paramOne(params.teamName);
  const { data: session, isLoading: sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const ran = useRef(false);
  const [status, setStatus] = useState<Status>(celebrate ? "done" : "working");
  const [message, setMessage] = useState("");
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(teamNameParam || null);

  useEffect(() => {
    if (ran.current || sessionLoading) return;
    if (!session?.user) return;

    const finishOk = (name?: string | null) => {
      if (teamId) {
        void queryClient.invalidateQueries({ queryKey: ["ownership-transfers-mine"] });
        void queryClient.invalidateQueries({ queryKey: ["ownership-transfer-pending", teamId] });
        void queryClient.invalidateQueries({ queryKey: ["teams"] });
      }
      if (name?.trim()) setTeamName(name.trim());
      setStatus("done");
      setTimeout(() => router.replace("/(app)/team"), HOLD_MS);
    };

    // Accept without card change — show celebration immediately.
    if (celebrate) {
      ran.current = true;
      finishOk(teamNameParam || null);
      return;
    }

    if (!teamId || !transferId) {
      ran.current = true;
      setStatus("error");
      setMessage("Missing transfer details. Open Team and try again from there.");
      return;
    }
    ran.current = true;

    if (billing === "cancel") {
      setStatus("canceled");
      void (async () => {
        try {
          const res = await completeOwnershipTransferPayment(teamId, transferId, {
            returnToApp: true,
          });
          if (res.completed) {
            finishOk(res.transfer?.teamName);
            return;
          }
          if (res.paymentSetupUrl) setSetupUrl(res.paymentSetupUrl);
        } catch {
          /* keep canceled */
        }
      })();
      return;
    }

    void (async () => {
      try {
        const res = await completeOwnershipTransferPayment(teamId, transferId, {
          sessionId: sessionId || undefined,
          returnToApp: true,
        });
        if (res.completed) {
          finishOk(res.transfer?.teamName);
          return;
        }
        setStatus("needs_card");
        setMessage(
          "The card on file is still the previous owner’s. Add a different card in your name to finish.",
        );
        setSetupUrl(res.paymentSetupUrl);
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Could not finish the transfer.");
      }
    })();
  }, [
    billing,
    celebrate,
    queryClient,
    session?.user,
    sessionLoading,
    sessionId,
    teamId,
    teamNameParam,
    transferId,
  ]);

  if (sessionLoading) {
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}
        testID="ownership-transfer-loading"
      >
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#4361EE" />
      </View>
    );
  }

  if (!session?.user) {
    return (
      <Redirect
        href={{
          pathname: "/sign-in",
          params: teamId && transferId ? { returnTo: "ownership-transfer", teamId, transferId } : undefined,
        }}
      />
    );
  }

  if (status === "done") {
    return <OwnershipSuccessMoment teamName={teamName} />;
  }

  const title =
    status === "working"
      ? "Confirming your card…"
      : status === "canceled"
        ? "Card setup paused"
        : status === "needs_card"
          ? "Add a different card"
          : "Something went wrong";

  const body =
    status === "working"
      ? "Hang tight — finishing the ownership transfer."
      : status === "canceled"
        ? "Ownership hasn’t transferred yet. You can add a card to finish, or return to Team."
        : message;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 24,
        justifyContent: "center",
      }}
      testID="ownership-transfer-return"
    >
      <StatusBar style="dark" />
      {status === "working" ? (
        <ActivityIndicator size="large" color="#4361EE" style={{ marginBottom: 20 }} />
      ) : null}
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#0F172A", textAlign: "center" }}>
        {title}
      </Text>
      <Text
        style={{
          marginTop: 10,
          fontSize: 15,
          lineHeight: 22,
          color: "#64748B",
          textAlign: "center",
        }}
      >
        {body}
      </Text>

      {setupUrl && (status === "canceled" || status === "needs_card") ? (
        <TouchableOpacity
          onPress={() => void Linking.openURL(setupUrl)}
          style={{
            marginTop: 28,
            backgroundColor: "#4361EE",
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
          }}
          testID="ownership-transfer-retry-card"
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Add a different card</Text>
        </TouchableOpacity>
      ) : null}

      {status !== "working" ? (
        <TouchableOpacity
          onPress={() => router.replace("/(app)/team")}
          style={{ marginTop: 16, paddingVertical: 12, alignItems: "center" }}
          testID="ownership-transfer-back-team"
        >
          <Text style={{ color: "#4361EE", fontWeight: "600", fontSize: 15 }}>Return to Team</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
