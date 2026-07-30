import { useCallback } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { SwitchWorkspaceSheet } from "@/components/SwitchWorkspaceSheet";

/**
 * Route kept for deep links / older navigation.
 * Presents the same bottom sheet, then pops when closed.
 */
export default function SwitchWorkspaceScreen() {
  const onClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/chat");
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <SwitchWorkspaceSheet visible onClose={onClose} />
    </View>
  );
}
