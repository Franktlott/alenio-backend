import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../lib/session-context";
import { colors } from "../lib/theme";

export default function Index() {
  const { ready, token, teamId } = useSession();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!token) return <Redirect href="/sign-in" />;
  if (!teamId) return <Redirect href="/select-team" />;
  return <Redirect href="/(app)/today" />;
}
