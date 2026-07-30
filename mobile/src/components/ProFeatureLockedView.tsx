import React from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CalendarDays, ListChecks, Lock, Users } from "lucide-react-native";
import { router } from "expo-router";
import { PAYWALL_BODY, PAYWALL_TITLE } from "@/lib/plan-access-copy";

type Props = {
  title?: string;
  body?: string;
  testID?: string;
  variant?: "default" | "workspace";
  ctaLabel?: string;
};

export function ProFeatureLockedView({
  title = PAYWALL_TITLE,
  body = PAYWALL_BODY,
  testID = "pro-feature-locked",
  variant = "default",
  ctaLabel = "View plan details",
}: Props) {
  if (variant === "workspace") {
    const features = [
      {
        Icon: ListChecks,
        title: "Assign & track tasks",
        body: "See what’s due, who owns it, and progress in real time.",
      },
      {
        Icon: CalendarDays,
        title: "Schedule recurring work",
        body: "Create repeatable tasks and shift schedules.",
      },
      {
        Icon: Users,
        title: "Shared team calendar",
        body: "Keep events and deadlines in one team calendar.",
      },
    ];

    return (
      <ScrollView
        testID={testID}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 28,
          paddingTop: 18,
          paddingBottom: 30,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 340, alignItems: "center" }}>
          <Image
            source={require("@/assets/alenio-workspace-upgrade-hero.png")}
            resizeMode="contain"
            style={{ width: 292, height: 174, marginBottom: -24 }}
          />
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#F0EEFF",
              borderWidth: 6,
              borderColor: "rgba(255,255,255,0.9)",
              marginBottom: 10,
            }}
          >
            <Lock size={28} color="#6D4AFF" strokeWidth={2.2} />
          </View>
          <View
            style={{
              borderRadius: 999,
              backgroundColor: "#F1EFFF",
              paddingHorizontal: 10,
              paddingVertical: 4,
              marginBottom: 8,
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: "800", color: "#6D4AFF", letterSpacing: 0.8 }}>
              PRO FEATURE
            </Text>
          </View>
          <Text
            style={{
              fontSize: 22,
              lineHeight: 27,
              fontWeight: "800",
              color: "#111827",
              textAlign: "center",
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 13,
              lineHeight: 18,
              color: "#667085",
              textAlign: "center",
              maxWidth: 310,
            }}
          >
            {body}
          </Text>

          <View style={{ width: "100%", marginTop: 14 }}>
            {features.map(({ Icon, title: featureTitle, body: featureBody }, index) => (
              <View key={featureTitle}>
                {index > 0 ? <View style={{ height: 1, backgroundColor: "#EEF1F5", marginLeft: 50 }} /> : null}
                <View style={{ minHeight: 54, flexDirection: "row", alignItems: "center", gap: 11 }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#F3F1FF",
                    }}
                  >
                    <Icon size={18} color="#6D4AFF" strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#20283A" }}>{featureTitle}</Text>
                    <Text style={{ marginTop: 2, fontSize: 9, lineHeight: 12, color: "#7A869A" }}>
                      {featureBody}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => router.push("/account-hub")}
            testID={`${testID}-cta`}
            style={{ width: "100%", marginTop: 12, borderRadius: 12, overflow: "hidden" }}
          >
            <LinearGradient
              colors={["#4361EE", "#8B2CF5"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Lock size={14} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>{ctaLabel}</Text>
              <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 14 }}>→</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/account-hub")} style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ color: "#5B4EF5", fontSize: 12, fontWeight: "600" }}>View plan details</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

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
          <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>{ctaLabel}</Text>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>→</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}
