import { type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useAdaptiveLayout } from "@/lib/adaptive-layout";
import { WS } from "./workspace-ui";

type Props = {
  bottomInset: number;
  hero: ReactNode;
  quickActions: ReactNode;
  pulse: ReactNode;
  upcomingEvents: ReactNode;
  recentUpdates: ReactNode;
  teamDevelopment: ReactNode;
};

/**
 * Overview layout — single column on phones; two columns in landscape/split.
 */
export function WorkspaceOverviewPage({
  bottomInset,
  hero,
  quickActions,
  pulse,
  upcomingEvents,
  recentUpdates,
  teamDevelopment,
}: Props) {
  const adaptive = useAdaptiveLayout();
  const landscape = adaptive.isSplit;
  /**
   * Band tabs already pad the sheet for the Duo dock. Skip contentPad on that
   * edge so Overview matches Home width.
   */
  const padLeft =
    adaptive.iconRailEdge === "left"
      ? 0
      : adaptive.iconRailEdge
        ? Math.max(WS.pageGutter, adaptive.contentPadLeft)
        : adaptive.contentPadLeft + WS.pageGutter;
  const padRight =
    adaptive.iconRailEdge === "right"
      ? 0
      : adaptive.iconRailEdge
        ? Math.max(WS.pageGutter, adaptive.contentPadRight)
        : adaptive.contentPadRight + WS.pageGutter;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{
        paddingTop: 10,
        paddingBottom: bottomInset + 16,
        paddingLeft: padLeft,
        paddingRight: padRight,
      }}
      showsVerticalScrollIndicator={false}
      testID="workspace-overview-page"
    >
      {landscape ? (
        <View style={styles.splitRow}>
          <View style={styles.mainCol}>
            {hero}
            {quickActions}
            {pulse}
            {teamDevelopment}
          </View>
          <View style={styles.railCol}>
            {upcomingEvents}
            {recentUpdates}
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          {hero}
          {quickActions}
          {pulse}
          {teamDevelopment}
          {upcomingEvents}
          {recentUpdates}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  stack: {
    gap: 12,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  mainCol: {
    flexGrow: 1.65,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    gap: 12,
  },
  railCol: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 280,
    maxWidth: 420,
    gap: 12,
  },
});
