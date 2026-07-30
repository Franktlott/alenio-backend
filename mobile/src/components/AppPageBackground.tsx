import { View } from "react-native";
import { colors } from "@/theme";

export const APP_PAGE_BACKGROUND = colors.pageBg;

export function AppPageBackground() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: colors.pageBg,
      }}
    />
  );
}
