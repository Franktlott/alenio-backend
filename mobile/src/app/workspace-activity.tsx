import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { WorkspaceActivityScreen } from "@/components/activity/WorkspaceActivityScreen";

export default function WorkspaceActivityRoute() {
  const { teamId } = useLocalSearchParams<{ teamId?: string }>();
  if (!teamId) {
    return (
      <View testID="workspace-activity-missing-team" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#27324A" }}>Choose a workspace to view its activity.</Text>
        <Pressable onPress={() => router.replace("/(app)/execute")} testID="workspace-activity-back" style={{ marginTop: 14, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#5368F5" }}>
          <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Back to workspace</Text>
        </Pressable>
      </View>
    );
  }
  return <WorkspaceActivityScreen />;
}

