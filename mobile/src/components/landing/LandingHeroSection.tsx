import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Shield } from "lucide-react-native";
import { router } from "expo-router";

type Props = {
  fill?: boolean;
  compact?: boolean;
};

export function LandingHeroSection({ fill, compact }: Props) {
  const { width } = useWindowDimensions();
  const heroWidth = width - 48;

  return (
    <View
      style={[styles.wrap, fill ? styles.wrapFill : null]}
      accessibilityRole="image"
      accessibilityLabel="Frontline team members using Alenio"
    >
      <View style={[styles.heroFrame, fill ? styles.heroFrameFill : { width: heroWidth }, compact && styles.heroFrameCompact]}>
        <Image source={require("@/assets/landing1.png")} style={styles.heroImage} resizeMode="cover" />
        <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)"]} style={styles.heroFade} pointerEvents="none" />

        <Pressable
          onPress={() => router.push("/sign-up")}
          style={({ pressed }) => [styles.trustCard, pressed && styles.trustCardPressed]}
          accessibilityRole="button"
          accessibilityLabel="Built for frontline teams"
          testID="welcome-trust-card"
        >
          <View style={styles.trustIcon}>
            <Shield size={16} color="#4361EE" strokeWidth={2.3} />
          </View>
          <View style={styles.trustCopy}>
            <Text style={styles.trustTitle} numberOfLines={1}>
              Built for frontline teams
            </Text>
            <Text style={styles.trustSubtitle} numberOfLines={2}>
              Secure, reliable, and easy to use — wherever you work.
            </Text>
          </View>
          <ChevronRight size={18} color="#4361EE" strokeWidth={2.4} />
        </Pressable>
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
    marginTop: 8,
    alignSelf: "stretch",
  },
  heroFrame: {
    borderRadius: 18,
    overflow: "hidden",
    height: 168,
    backgroundColor: "#EEF2FF",
  },
  heroFrameCompact: {
    height: 140,
  },
  heroFrameFill: {
    flex: 1,
    width: "100%",
    height: undefined,
    alignSelf: "stretch",
    minHeight: 150,
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
    height: 88,
  },
  trustCard: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EDF5",
    paddingHorizontal: 12,
    paddingVertical: 11,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  trustCardPressed: {
    backgroundColor: "#F8FAFC",
  },
  trustIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  trustCopy: {
    flex: 1,
    minWidth: 0,
  },
  trustTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  trustSubtitle: {
    fontSize: 11,
    color: "#64748B",
    lineHeight: 14,
    marginTop: 2,
  },
});
