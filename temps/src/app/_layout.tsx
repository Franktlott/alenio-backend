import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BrandLogo } from "../components/BrandLogo";
import { SessionProvider, useSession } from "../lib/session-context";
import { colors } from "../lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { ready } = useSession();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      // Brief hold so the logo is readable on cold start.
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled) return;
      await SplashScreen.hideAsync().catch(() => {});
      setSplashDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.inkOnDark,
          headerTitleStyle: { fontWeight: "800", color: colors.inkOnDark },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="select-team" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
      {!splashDone ? (
        <View style={styles.splash} pointerEvents="none">
          <BrandLogo width={280} height={72} />
        </View>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
});
