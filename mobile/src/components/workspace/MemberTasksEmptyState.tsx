import { View, Text, Image } from "react-native";
import { WS } from "./workspace-ui";

export function MemberTasksEmptyState() {
  return (
    <View
      style={{
        alignItems: "center",
        paddingTop: 18,
        paddingHorizontal: 28,
        backgroundColor: WS.surface,
      }}
      testID="member-tasks-empty-state"
    >
      <Image
        source={require("@/assets/alenio-empty-tasks-people.png")}
        style={{ width: 210, height: 210, marginBottom: -12 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <Text
        style={{
          fontSize: 19,
          fontWeight: "800",
          color: "#111A2B",
          textAlign: "center",
        }}
      >
        You’re all set!
      </Text>
      <Text
        style={{
          marginTop: 8,
          maxWidth: 270,
          fontSize: 13,
          lineHeight: 19,
          color: "#7A8699",
          textAlign: "center",
        }}
      >
        You don’t have any tasks right now. When your leader assigns tasks,
        they’ll appear here.
      </Text>
    </View>
  );
}
