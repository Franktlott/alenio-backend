import { LinearGradient } from "expo-linear-gradient";

export const APP_PAGE_BACKGROUND = "#F8F7FF";

export function AppPageBackground() {
  return (
    <LinearGradient
      colors={["#FCFDFF", "#F8F7FF", "#F4F2FC"]}
      locations={[0, 0.48, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      pointerEvents="none"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
    />
  );
}
