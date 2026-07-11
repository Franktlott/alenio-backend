import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BarChart3, Check, Megaphone, MessageCircle } from "lucide-react-native";

type Props = {
  fill?: boolean;
};

export function LandingHeroSection({ fill }: Props) {
  const { width } = useWindowDimensions();
  const heroWidth = width - 48;

  return (
    <View
      style={[styles.wrap, fill ? styles.wrapFill : null]}
      accessibilityRole="image"
      accessibilityLabel="Frontline team members using Alenio"
    >
      <View style={styles.blobLeft} />
      <View style={styles.blobRight} />

      <View style={[styles.heroFrame, fill ? styles.heroFrameFill : { width: heroWidth }]}>
        <Image source={require("@/assets/landing1.png")} style={styles.heroImage} resizeMode="cover" />
        <LinearGradient colors={["rgba(255,255,255,0)", "#FFFFFF"]} style={styles.heroFade} pointerEvents="none" />
      </View>

      <View style={[styles.floatTasks, { top: 4, right: 4 }]} pointerEvents="none">
        <Text style={styles.floatLabel}>Tasks</Text>
        <Text style={styles.floatTaskTitle}>Opening Checklist</Text>
        <View style={styles.progressTrack}>
          <View style={styles.progressFill} />
        </View>
      </View>

      <View style={[styles.floatUpdate, { top: "38%", left: -4 }]} pointerEvents="none">
        <View style={styles.floatUpdateIcon}>
          <Megaphone size={10} color="#7C3AED" strokeWidth={2.4} />
        </View>
        <Text style={styles.floatUpdateText}>Team Update</Text>
      </View>

      <View style={[styles.floatIcon, { top: "12%", left: "20%" }]} pointerEvents="none">
        <MessageCircle size={9} color="#7C3AED" strokeWidth={2.4} />
      </View>
      <View style={[styles.floatIcon, styles.floatIconGreen, { top: "24%", left: "44%" }]} pointerEvents="none">
        <Check size={9} color="#10B981" strokeWidth={3} />
      </View>
      <View style={[styles.floatIcon, { top: "10%", right: "28%" }]} pointerEvents="none">
        <BarChart3 size={9} color="#4361EE" strokeWidth={2.4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    minHeight: 120,
  },
  wrapFill: {
    flex: 1,
    minHeight: 0,
    marginBottom: 0,
    marginTop: 4,
    alignSelf: "stretch",
  },
  blobLeft: {
    position: "absolute",
    top: 12,
    left: -28,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(124, 58, 237, 0.07)",
  },
  blobRight: {
    position: "absolute",
    top: 4,
    right: -16,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(67, 97, 238, 0.08)",
  },
  heroFrame: {
    borderRadius: 16,
    overflow: "hidden",
    height: 140,
  },
  heroFrameFill: {
    flex: 1,
    width: "100%",
    height: undefined,
    alignSelf: "stretch",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
  },
  floatTasks: {
    position: "absolute",
    width: 96,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  floatLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  floatTaskTitle: {
    fontSize: 9,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 4,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    width: "40%",
    height: "100%",
    backgroundColor: "#4361EE",
    borderRadius: 2,
  },
  floatUpdate: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  floatUpdateIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#F5F3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  floatUpdateText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#334155",
  },
  floatIcon: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#E8EDF5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  floatIconGreen: {
    backgroundColor: "#ECFDF5",
    borderColor: "#D1FAE5",
  },
});
