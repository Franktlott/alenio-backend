import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { WorkspaceOverviewCard } from "@/components/workspace/WorkspaceOverviewCard";
import type { Team } from "@/lib/types";

type Props = {
  team: Pick<Team, "name" | "image"> | null;
};

const BONE = "#EDE9FE";
const BONE_SOFT = "#F5F3FF";

/**
 * Shown only while a newly selected workspace has nothing on screen yet.
 * The real banner is already in place; the cards below breathe in until data lands.
 */
export function WorkspaceOpeningState({ team }: Props) {
  const name = team?.name?.trim() || "Workspace";
  const breath = useBreath();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      accessibilityRole="progressbar"
      accessibilityLabel={`Opening ${name}`}
      testID="workspace-opening"
    >
      <WorkspaceOverviewCard workspaceName={name} />
      <Animated.View
        style={{ opacity: breath }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.stack}>
          <View style={styles.actionRow}>
            {Array.from({ length: 4 }, (_, index) => (
              <View
                key={index}
                style={[styles.actionTile, index > 0 ? styles.actionGap : null]}
              >
                <View style={styles.actionChip} />
                <View style={styles.actionLine} />
                <View style={[styles.actionLine, styles.actionLineShort]} />
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Bone style={styles.titleBone} />
            <Bone style={styles.subtitleBone} />
            <View style={styles.metrics}>
              {Array.from({ length: 3 }, (_, index) => (
                <View key={index} style={styles.metric}>
                  <View style={styles.metricIcon} />
                  <View style={styles.metricCopy}>
                    <Bone style={styles.metricValue} />
                    <Bone style={styles.metricLabel} />
                  </View>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.card}>
            <Bone style={styles.titleBone} />
            <Bone style={[styles.subtitleBone, { width: "46%" }]} />
            <View style={styles.rings}>
              <View style={styles.ring} />
              <View style={styles.ring} />
              <View style={styles.legend}>
                <Bone style={styles.legendLine} />
                <Bone style={styles.legendLine} />
                <Bone style={[styles.legendLine, { width: "70%" }]} />
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

function Bone({ style }: { style: StyleProp<ViewStyle> }) {
  return <View style={[styles.bone, style]} />;
}

function useBreath() {
  const breath = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      breath.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 0.45,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, reduceMotion]);

  return breath;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 28,
    gap: 12,
  },
  stack: {
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  actionTile: {
    flex: 1,
    minHeight: 88,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8EAF0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
    gap: 6,
  },
  actionGap: {
    marginLeft: 6,
  },
  actionChip: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: BONE_SOFT,
  },
  actionLine: {
    width: "72%",
    height: 7,
    borderRadius: 4,
    backgroundColor: BONE,
  },
  actionLineShort: {
    width: "52%",
    backgroundColor: BONE_SOFT,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  bone: {
    backgroundColor: BONE,
    borderRadius: 6,
  },
  titleBone: {
    width: 132,
    height: 12,
  },
  subtitleBone: {
    width: "72%",
    height: 8,
    marginTop: 8,
    backgroundColor: BONE_SOFT,
  },
  metrics: {
    flexDirection: "row",
    marginTop: 16,
  },
  metric: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: BONE_SOFT,
  },
  metricCopy: {
    marginLeft: 6,
    gap: 5,
  },
  metricValue: {
    width: 18,
    height: 12,
  },
  metricLabel: {
    width: 46,
    height: 7,
    backgroundColor: BONE_SOFT,
  },
  rings: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    gap: 12,
  },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 7,
    borderColor: BONE_SOFT,
    backgroundColor: "#FFFFFF",
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendLine: {
    width: "88%",
    height: 8,
    backgroundColor: BONE_SOFT,
  },
});
