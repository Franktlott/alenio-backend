import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { NetworkUpdateDetailScreen } from "@/components/people/NetworkUpdateDetailScreen";

export default function NetworkUpdateDetailRoute() {
  const { activityId } = useLocalSearchParams<{ activityId?: string }>();

  if (!activityId) {
    return (
      <View style={styles.missing} testID="network-update-detail-missing">
        <Text style={styles.title}>That update is no longer available.</Text>
        <Pressable
          onPress={() => router.replace("/(app)/team")}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Back to My Network</Text>
        </Pressable>
      </View>
    );
  }

  return <NetworkUpdateDetailScreen activityId={activityId} />;
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
    backgroundColor: "#4361EE",
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
});
