import { Stack } from "expo-router";
import { useScreenOrientation } from "@/lib/use-screen-orientation";

/**
 * Welcome, sign-in and sign-up share one stack. Wide devices used to keep a
 * people photo panel beside the form; that split left a white column and a
 * hard edge, so every auth screen now owns the full canvas itself.
 */
export default function AuthLayout() {
  const screenOrientation = useScreenOrientation();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#FFFFFF" },
        orientation: screenOrientation,
      }}
    />
  );
}
