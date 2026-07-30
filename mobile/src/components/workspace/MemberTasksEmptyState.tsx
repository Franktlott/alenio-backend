import { View, Text, Image } from "react-native";
import { Lightbulb } from "lucide-react-native";
import { radii, space } from "@/theme";
import { WS } from "./workspace-ui";

export function MemberTasksEmptyState() {
  return (
    <View
      style={{
        flexGrow: 1,
        flex: 1,
        backgroundColor: WS.surface,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingHorizontal: space.lg,
        paddingVertical: space.lg,
        alignItems: "center",
        justifyContent: "center",
      }}
      testID="member-tasks-empty-state"
    >
      <Image
        source={require("@/assets/tasks-empty-caught-up.png")}
        style={{ width: 120, height: 120, marginBottom: 10 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <Text
        style={{
          fontSize: 16,
          fontWeight: "700",
          color: WS.ink,
          textAlign: "center",
          letterSpacing: -0.2,
          marginBottom: 4,
        }}
      >
        You’re all set!
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: WS.muted,
          textAlign: "center",
          lineHeight: 16,
          maxWidth: 280,
          marginBottom: 16,
        }}
      >
        You don’t have any tasks right now. When your leader assigns tasks, they’ll appear here.
      </Text>

      <View
        style={{
          width: "100%",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          backgroundColor: "#EEF2FF",
          borderRadius: radii.card,
          paddingHorizontal: space.md,
          paddingVertical: 10,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: "#DBEAFE",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          <Lightbulb size={14} color={WS.accent} strokeWidth={2.25} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: WS.ink, marginBottom: 2 }}>Stay in the loop</Text>
          <Text style={{ fontSize: 11, color: WS.muted, lineHeight: 14 }}>
            Check back here to see what’s next and stay on track with your team.
          </Text>
        </View>
      </View>
    </View>
  );
}
