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
import { useSession } from "@/lib/auth/use-session";
import { completeOwnershipTransferPayment } from "@/lib/ownership-transfer-api";

type Status = "working" | "done" | "needs_card" | "canceled" | "error";

function paramOne(v: string | string[] | undefined): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && typeof v[0] === "string") return v[0].trim();
  return "";
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
  }>();
  const teamId = paramOne(params.teamId);
  const transferId = paramOne(params.transferId);
  const billing = paramOne(params.billing);
  const sessionId = paramOne(params.session_id);
  const { data: session, isLoading: sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const ran = useRef(false);
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState("");
  const [setupUrl, setSetupUrl] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current || sessionLoading) return;
    if (!session?.user) return;
    if (!teamId || !transferId) {
      ran.current = true;
      setStatus("error");
      setMessage("Missing transfer details. Open Team and try again from there.");
      return;
    }
    ran.current = true;

    const finishOk = () => {
      void queryClient.invalidateQueries({ queryKey: ["ownership-transfers-mine"] });
      void queryClient.invalidateQueries({ queryKey: ["ownership-transfer-pending", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      setStatus("done");
      setTimeout(() => router.replace("/(app)/team"), 1200);
    };

    if (billing === "cancel") {
      setStatus("canceled");
      void (async () => {
        try {
          const res = await completeOwnershipTransferPayment(teamId, transferId, {
            returnToApp: true,
          });
          if (res.completed) {
            finishOk();
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
          finishOk();
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
  }, [billing, queryClient, session?.user, sessionLoading, sessionId, teamId, transferId]);

  if (sessionLoading) {
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8F7FF" }}
        testID="ownership-transfer-loading"
      >
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

  const title =
    status === "working"
      ? "Confirming your card…"
      : status === "done"
        ? "You’re the new owner"
        : status === "canceled"
          ? "Card setup paused"
          : status === "needs_card"
            ? "Add a different card"
            : "Something went wrong";

  const body =
    status === "working"
      ? "Hang tight — finishing the ownership transfer."
      : status === "done"
        ? "Taking you back to Team…"
        : status === "canceled"
          ? "Ownership hasn’t transferred yet. You can add a card to finish, or return to Team."
          : status === "needs_card"
            ? message
            : message;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#F8F7FF",
        paddingHorizontal: 24,
        justifyContent: "center",
      }}
      testID="ownership-transfer-return"
    >
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

      {status !== "working" && status !== "done" ? (
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
