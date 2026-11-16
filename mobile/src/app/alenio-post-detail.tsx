import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AlenioPostDetailScreen } from "@/components/people/AlenioPostDetailScreen";

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0]) {
    return value[0];
  }
  return undefined;
}

export default function AlenioPostDetailRoute() {
  const params = useLocalSearchParams<{
    activityId?: string | string[];
    id?: string | string[];
  }>();
  const activityId =
    firstParam(params.activityId) ?? firstParam(params.id);

  if (!activityId) {
    return (
      <View style={styles.missing} testID="alenio-post-detail-missing">
        <Text style={styles.title}>That post is no longer available.</Text>
        <Pressable
          onPress={() => router.replace("/(app)/team")}
          style={styles.button}
          testID="alenio-post-detail-missing-back"
        >
          <Text style={styles.buttonText}>Back to Feed</Text>
        </Pressable>
      </View>
    );
  }

  return <AlenioPostDetailScreen activityId={activityId} />;
}

const styles = StyleSheet.create({
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
    backgroundColor: "#FFFFFF",
  },
  title: { fontSize: 15, fontWeight: "700", color: "#27324A" },
  button: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#6d28d9",
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
});
