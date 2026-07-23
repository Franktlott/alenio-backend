import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Lock } from "lucide-react-native";
import { router } from "expo-router";
import { PAYWALL_BODY, PAYWALL_TITLE } from "@/lib/plan-access-copy";

type Props = {
  title?: string;
  body?: string;
  testID?: string;
};

export function ProFeatureLockedView({
  title = PAYWALL_TITLE,
  body = PAYWALL_BODY,
  testID = "pro-feature-locked",
}: Props) {
  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
        paddingBottom: 40,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Lock size={28} color="#4361EE" />
      </View>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: "#0F172A",
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: "#64748B",
          textAlign: "center",
          lineHeight: 20,
          marginBottom: 22,
        }}
      >
        {body}
      </Text>
      <TouchableOpacity
        onPress={() => router.push("/account-hub")}
        testID={`${testID}-cta`}
        style={{
          borderRadius: 12,
          overflow: "hidden",
          width: "100%",
          maxWidth: 320,
          shadowColor: "#4361EE",
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 5,
        }}
      >
        <LinearGradient
          colors={["#4361EE", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            paddingVertical: 13,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>View plan details</Text>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>→</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}
