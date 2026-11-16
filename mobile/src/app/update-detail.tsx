import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { UpdateDetailScreen } from "@/components/workspace/UpdateDetailScreen";

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0]) {
    return value[0];
  }
  return undefined;
}

export default function UpdateDetailRoute() {
  const params = useLocalSearchParams<{
    teamId?: string | string[];
    activityId?: string | string[];
    id?: string | string[];
  }>();
  const teamId = firstParam(params.teamId);
  const activityId =
    firstParam(params.activityId) ?? firstParam(params.id);

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
          onPress={() => router.replace("/(app)/team")}
          testID="update-detail-missing-back"
          style={{
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: "#4361EE",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
            Back to Feed
          </Text>
        </Pressable>
      </View>
    );
  }

  return <UpdateDetailScreen teamId={teamId} activityId={activityId} />;
}
