import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTabHeader } from "../components/AppTabHeader";
import { useSession } from "../lib/session-context";
import { colors } from "../lib/theme";

export default function Index() {
  const { ready, token, teamId } = useSession();
  const insets = useSafeAreaInsets();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppTabHeader topInset={insets.top} />
        <View style={{ flex: 1 }} />
      </View>
    );
  }

  if (!token) return <Redirect href="/sign-in" />;
  if (!teamId) return <Redirect href="/select-team" />;
  return <Redirect href="/(app)/today" />;
}
