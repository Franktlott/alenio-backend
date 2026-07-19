import { Redirect, Tabs } from "expo-router";
import { AppTabHeader } from "../../components/AppTabHeader";
import { useSession } from "../../lib/session-context";
import { colors } from "../../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AppLayout() {
  const { token, teamId } = useSession();
  const insets = useSafeAreaInsets();
  if (!token) return <Redirect href="/sign-in" />;
  if (!teamId) return <Redirect href="/select-team" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        tabBarStyle: { display: "none" },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Checks",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          href: null,
          title: "History",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="equipment"
        options={{
          href: null,
          title: "Equipment",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          href: null,
          title: "More",
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="check/[occurrenceId]"
        options={{
          href: null,
          title: "",
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="probe-lab"
        options={{
          href: null,
          title: "Probe Lab",
          headerShown: true,
          header: () => <AppTabHeader topInset={insets.top} compact />,
        }}
      />
    </Tabs>
  );
}
