import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../lib/session-context";
import { colors } from "../lib/theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.brandDark,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: "Sign in" }} />
        <Stack.Screen name="select-team" options={{ title: "Workspace" }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </SessionProvider>
  );
}
