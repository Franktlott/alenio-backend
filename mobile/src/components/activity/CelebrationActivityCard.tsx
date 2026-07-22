import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Svg, { Path } from "react-native-svg";
import { Star, Users } from "lucide-react-native";
import Animated, {
  Easing,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { ActivityFeedItem } from "./types";
import { formatRelativeTime } from "./types";
import {
  getCelebrationCardTheme,
  type CelebrationHeroStyle,
  type CelebrationTheme,
} from "./celebration-themes";
import { UserAvatar } from "@/components/UserAvatar";

const alenioIcon = require("@/assets/alenio-icon.png");

export { CELEBRATION_CARD_THEMES, getCelebrationCardTheme } from "./celebration-themes";

type Props = {
  item: ActivityFeedItem;
  footer?: ReactNode;
  onLongPress?: () => void;
  onCelebrate?: (item: ActivityFeedItem) => void;
  testID?: string;
};

function QuoteMarkOpen({ color, size = 34 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size * 0.78} viewBox="0 0 48 38" fill="none">
      <Path d="M10 36C10 24.5 16.5 16 26 12.5V20c-4.2 1.2-7 4.6-7 9.2V36H10Z" fill={color} />
      <Path d="M28 36C28 24.5 34.5 16 44 12.5V20c-4.2 1.2-7 4.6-7 9.2V36H28Z" fill={color} />
    </Svg>
  );
}

function QuoteMarkClose({ color, size = 34 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size * 0.78} viewBox="0 0 48 38" fill="none">
      <Path d="M38 2C38 13.5 31.5 22 22 25.5V18c4.2-1.2 7-4.6 7-9.2V2H38Z" fill={color} />
      <Path d="M20 2C20 13.5 13.5 22 4 25.5V18c4.2-1.2 7-4.6 7-9.2V2H20Z" fill={color} />
    </Svg>
  );
}

function GlassQuote({ message, theme }: { message: string; theme: CelebrationTheme }) {
  return (
    <View style={[styles.quoteShell, { flex: 1 }]}>
      <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.12)" }]} />
      <View style={styles.quoteBorder} />

      <View style={styles.quoteMarkOpen} pointerEvents="none">
        <QuoteMarkOpen color={theme.quoteMark} size={22} />
      </View>
      <View style={styles.quoteMarkClose} pointerEvents="none">
        <QuoteMarkClose color={theme.quoteMark} size={22} />
      </View>

      <View style={styles.quoteTextWrap}>
        <Text style={styles.quoteText}>
          {message}
        </Text>
      </View>
    </View>
  );
}

function DriftParticles({ color }: { color: string }) {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [drift]);

  const styleA = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(drift.value, [0, 1], [0, -6]) }, { translateX: interpolate(drift.value, [0, 1], [0, 3]) }],
    opacity: 0.35 + drift.value * 0.2,
  }));
  const styleB = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(drift.value, [0, 1], [0, 5]) }, { translateX: interpolate(drift.value, [0, 1], [0, -4]) }],
    opacity: 0.25 + (1 - drift.value) * 0.2,
  }));

  return (
    <View style={styles.particleField} pointerEvents="none">
      <Animated.View style={[{ position: "absolute", top: 10, right: 18, width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }, styleA]} />
      <Animated.View style={[{ position: "absolute", top: 28, right: 42, width: 2, height: 2, borderRadius: 1, backgroundColor: color }, styleB]} />
      <Animated.View style={[{ position: "absolute", top: 48, right: 14, width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: color }, styleA]} />
      <Animated.Text style={[{ position: "absolute", top: 8, right: 56, fontSize: 9, color }, styleB]}>✦</Animated.Text>
      <Animated.Text style={[{ position: "absolute", top: 36, right: 30, fontSize: 8, color }, styleA]}>✧</Animated.Text>
    </View>
  );
}

function TrophyHero({ theme }: { theme: CelebrationTheme }) {
  const shine = useSharedValue(0);
  const entryGlow = useSharedValue(0);
  const style: CelebrationHeroStyle = theme.hero;
  const Icon = theme.Icon;

  useEffect(() => {
    entryGlow.value = withSequence(
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
      withTiming(0.35, { duration: 900 }),
    );
    shine.value = withRepeat(
      withSequence(
        withDelay(16000, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    );
  }, [entryGlow, shine]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + entryGlow.value * 0.35 + shine.value * 0.25,
    transform: [{ scale: 1 + shine.value * 0.06 }],
  }));

  const shineSweep = useAnimatedStyle(() => ({
    opacity: shine.value * 0.55,
    transform: [{ translateX: interpolate(shine.value, [0, 1], [-28, 36]) }, { rotate: "22deg" }],
  }));

  return (
    <View style={styles.trophyWrap} pointerEvents="none">
      <Animated.View style={[styles.trophyGlow, { backgroundColor: "#F59E0B" }, glowStyle]} />

      {style === "target" ? (
        <View style={styles.targetOuter}>
          <View style={[styles.targetInner, { borderColor: theme.accentSoft }]}>
            <Icon size={16} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </View>
      ) : (
        <View style={styles.medalStack}>
          <LinearGradient
            colors={["#FDE68A", "#F59E0B", "#D97706"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.medalFace}
          >
            <View style={styles.medalCore}>
              <Icon size={16} color="#FFFFFF" strokeWidth={2.4} />
            </View>
            <Animated.View style={[styles.shineBar, shineSweep]} />
          </LinearGradient>
        </View>
      )}

      <View style={styles.ribbon}>
        <Text style={styles.ribbonText}>{theme.label}</Text>
      </View>

      <Text style={[styles.sparkle, { top: 0, right: 0 }]}>✦</Text>
      <Text style={[styles.sparkle, { top: 14, right: -2, fontSize: 7, opacity: 0.55 }]}>✧</Text>
      <Text style={[styles.sparkle, { bottom: 12, right: 4, fontSize: 6, opacity: 0.45 }]}>✦</Text>
    </View>
  );
}

function AvatarFocal({
  image,
  name,
  theme,
}: {
  image?: string | null;
  name: string;
  theme: CelebrationTheme;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2200 })),
      -1,
      false,
    );
  }, [pulse]);

  const ringPulse = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.35,
    transform: [{ scale: 1 + pulse.value * 0.05 }],
  }));

  return (
    <View style={styles.avatarWrap} accessibilityLabel={`${name} photo`}>
      <Animated.View style={[styles.avatarGlow, { backgroundColor: theme.glow }, ringPulse]} />
      <View style={styles.avatarWhiteRing}>
        <UserAvatar
          user={{ name, image }}
          size={40}
          radius={20}
          backgroundColor={theme.gradient[1]}
          textColor="#FFFFFF"
          fontSize={15}
        />
      </View>
      <View style={styles.avatarBadge}>
        <Star size={7} color="#FFFFFF" fill="#FFFFFF" strokeWidth={0} />
      </View>
    </View>
  );
}

function CelebratePill({
  color,
  onPress,
  testID,
}: {
  color: string;
  onPress: () => void;
  testID?: string;
}) {
  const scale = useSharedValue(1);
  const [burst, setBurst] = useState(false);

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(withSpring(0.92, { damping: 14 }), withSpring(1, { damping: 12 }));
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
    onPress();
  };

  return (
    <View style={{ position: "relative" }}>
      {burst ? (
        <View style={styles.burstLayer} pointerEvents="none">
          {["✦", "♥", "✧", "★", "+1"].map((char, i) => (
            <Animated.Text
              key={`${char}-${i}`}
              entering={FadeInUp.delay(i * 40).duration(280)}
              style={[
                styles.burstChip,
                {
                  left: 8 + i * 10,
                  top: -6 - (i % 3) * 8,
                  color: i === 4 ? "#FFFFFF" : color,
                },
              ]}
            >
              {char}
            </Animated.Text>
          ))}
        </View>
      ) : null}

      <Animated.View style={btnStyle}>
        <Pressable onPress={handlePress} testID={testID} style={styles.celebrateBtn}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.16)" }]} />
          <Users size={12} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.celebrateBtnText}>Celebrate</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function CelebrationActivityCard({ item, footer, onLongPress, onCelebrate, testID }: Props) {
  const theme = getCelebrationCardTheme(item.metadata.celebrationType);
  const Icon = theme.Icon;
  const fromName = item.actor?.name ?? "Someone";
  const toName = item.metadata.targetName ?? item.title ?? "a teammate";
  const toImage = item.metadata.targetUserImage ?? null;
  const message = item.metadata.message?.trim() || null;

  return (
    <Animated.View
      entering={FadeInUp.duration(450).damping(18)}
      style={styles.cardOuter}
    >
      <Pressable
        onLongPress={onLongPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.98 : 1 }]}
        testID={testID ?? `celebration-activity-card-${item.id}`}
      >
        <View style={styles.cardClip}>
          {/* Layered background */}
          <LinearGradient
            colors={[theme.gradient[0], theme.gradient[1], theme.gradient[2]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.14)", "transparent"]}
            start={{ x: 0.15, y: 0.1 }}
            end={{ x: 0.85, y: 0.9 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["rgba(255,255,255,0.18)", "transparent"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.35 }}
            style={styles.topHighlight}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.22)", "transparent", "rgba(0,0,0,0.28)"]}
            locations={[0, 0.45, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.grainA} />
          <View style={styles.grainB} />

          <DriftParticles color={theme.accentSoft} />

          <View style={styles.content}>
            {/* Top: identity left, time + icon right */}
            <View style={styles.topRow}>
              <View style={styles.topLeft}>
                <View style={styles.headerRow}>
                  <View style={styles.typePill}>
                    <Icon size={10} color={theme.accent} strokeWidth={2.5} />
                    <Text style={styles.typePillText}>{theme.label}</Text>
                  </View>
                </View>

                <View style={styles.identityRow}>
                  <AvatarFocal image={toImage} name={toName} theme={theme} />
                  <View style={styles.identityCopy}>
                    <Text style={styles.nameText} numberOfLines={1}>
                      {toName}
                    </Text>
                    <Text style={styles.byText} numberOfLines={1}>
                      Recognized by {fromName}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.topRight}>
                <Text style={styles.timeText}>{formatRelativeTime(item.timestamp)}</Text>
                <TrophyHero theme={theme} />
              </View>
            </View>

            {/* Quote */}
            <View style={styles.bodyRow}>
              <View style={styles.recognitionSlot}>
                {message ? (
                  <GlassQuote message={message} theme={theme} />
                ) : (
                  <View style={styles.recognitionEmpty}>
                    <Text style={styles.recognitionEmptyText}>{theme.blurb}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Reactions + Celebrate */}
            <View style={styles.footerRow}>
              <Image source={alenioIcon} style={styles.alenioMark} accessibilityLabel="Alenio" />
              <View style={styles.footerReactions}>{footer}</View>
              {onCelebrate ? (
                <CelebratePill
                  color={theme.accent}
                  onPress={() => onCelebrate(item)}
                  testID={`${testID ?? item.id}-celebrate`}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: "#4C1D95",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  cardClip: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  topHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  grainA: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  grainB: {
    position: "absolute",
    top: "18%",
    left: "10%",
    width: "50%",
    height: "34%",
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  particleField: {
    position: "absolute",
    top: 18,
    right: 0,
    width: 72,
    height: 54,
  },
  content: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 10,
    gap: 7,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  topLeft: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  topRight: {
    alignItems: "center",
    gap: 4,
    paddingTop: 1,
    flexShrink: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  typePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  timeText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "600",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  recognitionSlot: {
    flex: 1,
    minWidth: 0,
  },
  recognitionEmpty: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
    minHeight: 56,
  },
  recognitionEmptyText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: "rgba(255,255,255,0.78)",
  },
  avatarWrap: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarGlow: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarWhiteRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 2,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  nameText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  byText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.55)",
    fontWeight: "500",
    marginTop: 1,
  },
  trophyWrap: {
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  trophyGlow: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  medalStack: {
    alignItems: "center",
  },
  medalFace: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
    overflow: "hidden",
  },
  medalCore: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  shineBar: {
    position: "absolute",
    width: 12,
    height: 64,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  ribbon: {
    marginTop: -8,
    backgroundColor: "rgba(15, 10, 40, 0.88)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
  },
  ribbonText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  targetOuter: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  targetInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  targetDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  sparkle: {
    position: "absolute",
    color: "#FDE68A",
    fontSize: 10,
    opacity: 0.7,
  },
  quoteShell: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginRight: 0,
  },
  quoteBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  quoteMarkOpen: {
    position: "absolute",
    top: 5,
    left: 7,
    opacity: 0.75,
    zIndex: 0,
  },
  quoteMarkClose: {
    position: "absolute",
    bottom: 4,
    right: 7,
    opacity: 0.75,
    zIndex: 0,
  },
  quoteTextWrap: {
    justifyContent: "center",
    // Keep message clear of decorative quote marks (corners only)
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 34,
    paddingRight: 30,
  },
  quoteText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: "rgba(255,255,255,0.96)",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 2,
  },
  alenioMark: {
    width: 22,
    height: 22,
    borderRadius: 6,
    flexShrink: 0,
  },
  footerReactions: {
    flex: 1,
    minWidth: 0,
  },
  celebrateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  celebrateBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  burstLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 20,
  },
  burstChip: {
    position: "absolute",
    fontSize: 10,
    fontWeight: "800",
  },
});
