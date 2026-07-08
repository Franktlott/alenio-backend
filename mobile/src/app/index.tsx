import { router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AUTH_READY_QUERY_KEY, useMobileAuthReady } from "@/lib/auth/use-session";

/** Cold-start gate: root layout navigates into `(app)` once auth-ready is set. */
export default function Index() {
  const queryClient = useQueryClient();
  const { data: authReady } = useMobileAuthReady();
  const bootstrapped = queryClient.getQueryState(AUTH_READY_QUERY_KEY)?.dataUpdatedAt != null;

  useEffect(() => {
    if (!bootstrapped || !!authReady?.me?.id) return;
    router.replace("/welcome");
  }, [authReady?.me?.id, bootstrapped]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }}>
      <ActivityIndicator size="large" color="#4361EE" />
    </View>
  );
}
