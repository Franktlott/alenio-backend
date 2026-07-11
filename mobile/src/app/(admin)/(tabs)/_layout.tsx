import { Tabs } from "expo-router";
import { LayoutGrid, Users, Briefcase, BarChart3, Settings } from "lucide-react-native";
import {
  TAB_BAR_ACTIVE_COLOR,
  TAB_BAR_HEIGHT,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INACTIVE_COLOR,
  TAB_BAR_LABEL_SIZE,
  TAB_BAR_DIVIDER_COLOR,
} from "@/lib/tab-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AdminTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_BAR_ACTIVE_COLOR,
        tabBarInactiveTintColor: TAB_BAR_INACTIVE_COLOR,
        tabBarLabelStyle: {
          fontSize: TAB_BAR_LABEL_SIZE,
          fontWeight: "600",
        },
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
          borderTopColor: TAB_BAR_DIVIDER_COLOR,
          backgroundColor: "#FFFFFF",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => <LayoutGrid size={TAB_BAR_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: "Users",
          tabBarIcon: ({ color }) => <Users size={TAB_BAR_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="workspaces"
        options={{
          title: "Workspaces",
          tabBarIcon: ({ color }) => <Briefcase size={TAB_BAR_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color }) => <BarChart3 size={TAB_BAR_ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Settings size={TAB_BAR_ICON_SIZE} color={color} />,
        }}
      />
    </Tabs>
  );
}
