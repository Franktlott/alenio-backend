import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";

function ProgressRing({ percent }: { percent: number }) {
  const size = 58;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const boundedPercent = Math.max(0, Math.min(100, percent));

  return (
    <View style={styles.ring}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E7E8F1"
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#6255F6"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={
            circumference - (boundedPercent / 100) * circumference
          }
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.ringText}>{boundedPercent}%</Text>
    </View>
  );
}

export function GetStartedProgressCard({
  completedCount,
  totalCount,
  remainingCount,
  percent,
  onPress,
}: {
  completedCount: number;
  totalCount: number;
  remainingCount: number;
  percent: number;
  onPress: () => void;
}) {
  if (totalCount > 0 && completedCount >= totalCount) return null;

  return (
    <View style={styles.cardShadow}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => (pressed ? styles.cardPressed : null)}
        accessibilityRole="button"
        accessibilityLabel={`Finish setting up Alenio. ${completedCount} of ${totalCount} complete.`}
        testID="get-started-progress-card"
      >
        <LinearGradient
          colors={["#FBFAFF", "#F2F3FF", "#F7F8FF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.glow} accessibilityElementsHidden />
          <View style={styles.mainRow}>
            <ProgressRing percent={percent} />

            <View style={styles.copy}>
              <Text style={styles.eyebrow}>GET STARTED</Text>
              <Text style={styles.title}>Finish setting up Alenio</Text>
              <Text style={styles.remaining}>
                {remainingCount} {remainingCount === 1 ? "step" : "steps"} remaining
              </Text>
            </View>

            <LinearGradient
              colors={["#5972F6", "#7957F4"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueButton}
              accessibilityElementsHidden
            >
              <ArrowRight size={17} color="#FFFFFF" strokeWidth={2.3} />
            </LinearGradient>
          </View>

          <View style={styles.segments} accessibilityElementsHidden>
            {Array.from({ length: totalCount }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.segment,
                  index < completedCount ? styles.segmentComplete : null,
                ]}
              />
            ))}
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    marginTop: 7,
    marginBottom: 11,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    shadowColor: "#29345C",
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 5,
  },
  card: {
    minHeight: 118,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 13,
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E6E7F2",
  },
  cardPressed: {
    opacity: 0.82,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  ring: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  ringSvg: {
    position: "absolute",
  },
  ringText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "800",
    color: "#5146E5",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    marginBottom: 3,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#7268E9",
  },
  title: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "800",
    color: "#172033",
    letterSpacing: -0.2,
  },
  remaining: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: "#7B879A",
  },
  continueButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#5C50DB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  glow: {
    position: "absolute",
    width: 118,
    height: 118,
    borderRadius: 59,
    right: -42,
    top: -62,
    backgroundColor: "rgba(117, 91, 246, 0.07)",
  },
  segments: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#E3E5ED",
  },
  segmentComplete: {
    backgroundColor: "#6255F6",
  },
});
