import { View, Text, Image } from "react-native";
import { Lightbulb } from "lucide-react-native";
import { WS } from "./workspace-ui";

export function MemberTasksEmptyState() {
  return (
    <View
      style={{
        flexGrow: 1,
        flex: 1,
        backgroundColor: WS.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 28,
        paddingTop: 16,
        paddingBottom: 24,
        alignItems: "center",
        justifyContent: "center",
      }}
      testID="member-tasks-empty-state"
    >
      <Image
        source={require("@/assets/tasks-empty-member-v2.png")}
        style={{ width: 220, height: 220, marginBottom: 8 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <Text
        style={{
          fontSize: 22,
          fontWeight: "800",
          color: WS.ink,
          textAlign: "center",
          letterSpacing: -0.3,
          marginBottom: 8,
        }}
      >
        You’re all set!
      </Text>
      <Text
        style={{
          fontSize: 15,
          color: WS.muted,
          textAlign: "center",
          lineHeight: 22,
          maxWidth: 300,
          marginBottom: 28,
        }}
      >
        You don’t have any tasks right now. When your leader assigns tasks, they’ll appear here.
      </Text>

      <View
        style={{
          width: "100%",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          backgroundColor: "#EEF2FF",
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#DBEAFE",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          <Lightbulb size={18} color={WS.accent} strokeWidth={2.25} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: WS.ink, marginBottom: 4 }}>Stay in the loop</Text>
          <Text style={{ fontSize: 13, color: WS.muted, lineHeight: 19 }}>
            Check back here to see what’s next and stay on track with your team.
          </Text>
        </View>
      </View>
    </View>
  );
}
