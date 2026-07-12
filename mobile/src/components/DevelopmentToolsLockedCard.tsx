import React from "react";
import { View, Text, Image, Pressable, Linking } from "react-native";
import {
  Lock,
  Target,
  CalendarCheck,
  FileText,
  BarChart3,
  Users,
  ExternalLink,
  Shield,
} from "lucide-react-native";
import { router } from "expo-router";
import { webBillingUrlForTeam } from "@/lib/plan-access-copy";

type Props = {
  isOwner?: boolean;
  compact?: boolean;
  teamId?: string | null;
  testID?: string;
};

const OWNER_FEATURES = [
  { icon: Target, label: "Set and track development goals" },
  { icon: CalendarCheck, label: "Schedule consistent check-ins" },
  { icon: FileText, label: "Capture notes and next steps" },
  { icon: BarChart3, label: "See progress over time" },
] as const;

const MEMBER_FEATURES = [
  { icon: Target, label: "Set and track development goals" },
  { icon: CalendarCheck, label: "Schedule and complete check-ins" },
  { icon: BarChart3, label: "View progress over time" },
] as const;

export function DevelopmentToolsLockedCard({
  isOwner = false,
  compact = false,
  teamId,
  testID,
}: Props) {
  const imageSize = compact ? 112 : 140;
  const features = isOwner ? OWNER_FEATURES : MEMBER_FEATURES;

  const openOwnerManage = async () => {
    const url = webBillingUrlForTeam(teamId ?? undefined, { subscribe: true });
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // fall through
    }
    router.push("/account-hub");
  };

  return (
    <View
      testID={testID ?? "development-tools-locked-card"}
      style={{
        flex: 1,
        minHeight: 0,
        marginHorizontal: 16,
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#E8ECF1",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
          paddingTop: compact ? 14 : 18,
          paddingBottom: compact ? 12 : 16,
        }}
      >
        <Image
          source={require("@/assets/growth-empty-goals.png")}
          style={{ width: imageSize, height: imageSize, marginBottom: 6 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: "#EEF2FF",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          <Lock size={15} color="#6366F1" strokeWidth={2.4} />
        </View>

        <Text
          style={{
            fontSize: compact ? 16 : 17,
            fontWeight: "800",
            color: "#0F172A",
            textAlign: "center",
            letterSpacing: -0.3,
            lineHeight: compact ? 22 : 24,
            marginBottom: 6,
            maxWidth: 300,
          }}
        >
          {isOwner ? "Unlock full development tools" : "Development tools are not included in this workspace plan"}
        </Text>

        <Text
          style={{
            fontSize: 13,
            color: "#64748B",
            textAlign: "center",
            lineHeight: 18,
            maxWidth: 300,
            marginBottom: 12,
          }}
        >
          {isOwner
            ? "Use goals and recurring check-ins to coach progress, document commitments, and keep development moving."
            : "Goals, check-ins, and development tracking help your team grow. Ask a workspace owner to enable this feature."}
        </Text>

        <View
          style={{
            width: "100%",
            maxWidth: 320,
            marginBottom: 14,
          }}
        >
          {features.map(({ icon: Icon, label }, index) => (
            <View key={label}>
              {index > 0 ? <View style={{ height: 1, backgroundColor: "#F1F5F9", marginLeft: 40 }} /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: "#EEF2FF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={14} color="#6366F1" strokeWidth={2.2} />
                </View>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#334155", lineHeight: 18 }}>
                  {label}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {isOwner ? (
          <Pressable
            onPress={() => void openOwnerManage()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              maxWidth: 320,
              paddingVertical: 13,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: "#6366F1",
            }}
            accessibilityRole="button"
            accessibilityLabel="Manage Workspace"
            testID="development-tools-locked-cta"
          >
            <ExternalLink size={16} color="#FFFFFF" strokeWidth={2.3} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Manage Workspace</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push("/account-hub")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
              maxWidth: 320,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 999,
              backgroundColor: "#F5F3FF",
              borderWidth: 1.5,
              borderColor: "#C4B5FD",
            }}
            accessibilityRole="button"
            accessibilityLabel="Ask a Workspace Owner"
            testID="development-tools-locked-cta"
          >
            <Users size={16} color="#6366F1" strokeWidth={2.2} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#6366F1" }}>Ask a Workspace Owner</Text>
          </Pressable>
        )}
      </View>

      {isOwner ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            backgroundColor: "#F5F3FF",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: "#EDE9FE",
          }}
        >
          <Shield size={14} color="#6366F1" strokeWidth={2.2} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 11.5, color: "#64748B", lineHeight: 16 }}>
            Available with an eligible workspace plan. Workspace owners can manage access and plans.
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", paddingBottom: 14, paddingHorizontal: 16 }}>
          You can still use all other features in Alenio.
        </Text>
      )}
    </View>
  );
}
