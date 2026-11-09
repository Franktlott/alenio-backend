import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { UpdateDetailScreen } from "@/components/workspace/UpdateDetailScreen";

export default function UpdateDetailRoute() {
  const { teamId, activityId } = useLocalSearchParams<{
    teamId?: string;
    activityId?: string;
  }>();

  if (!teamId || !activityId) {
    return (
      <View
        testID="update-detail-missing-params"
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 14,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#27324A" }}>
          That update is no longer available.
        </Text>
        <Pressable
          onPress={() => router.replace("/(app)/execute")}
          testID="update-detail-missing-back"
          style={{
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: "#4361EE",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
            Back to workspace
          </Text>
        </Pressable>
      </View>
    );
  }

  return <UpdateDetailScreen teamId={teamId} activityId={activityId} />;
}
