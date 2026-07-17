import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useSession } from "../../lib/session-context";
import { colors } from "../../lib/theme";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: focused ? "700" : "600", color: focused ? colors.brandDark : colors.muted }}>
      {label}
    </Text>
  );
}

export default function AppLayout() {
  const { token, teamId } = useSession();
  if (!token) return <Redirect href="/sign-in" />;
  if (!teamId) return <Redirect href="/select-team" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.brandDark,
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Today",
          tabBarLabel: ({ focused }) => <TabLabel label="Today" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarLabel: ({ focused }) => <TabLabel label="More" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="check/[occurrenceId]"
        options={{ href: null, title: "Take check", headerShown: true }}
      />
    </Tabs>
  );
}
