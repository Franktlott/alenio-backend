import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Mask,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { StatusBar, setStatusBarStyle } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { ArrowRight, Check, CircleCheck, Heart, MessageCircle } from "lucide-react-native";
import { SPLIT_MIN_ASPECT, SPLIT_MIN_WIDTH } from "@/lib/adaptive-layout";

/**
 * The welcome screen is the app's copy of the website hero (alenio.com), so
 * these values track web/src/routes/website-home.css rather than the in-app
 * palette. The gradients stay on this screen and the site; the app is flat.
 */
const PAGE = ["#0d0726", "#1a0b45", "#2a0f63"] as const;
const BRAND_TEXT = ["#22d3ee", "#818cf8", "#d946ef"] as const;
const CTA = ["#8b5cf6", "#a855f7", "#d946ef"] as const;

const TRUST_POINTS = ["Free to join the network", "14-day free workspace trial", "No credit card required"];

const SUBHEADLINE =
  "A professional network for frontline leaders, and a workspace that runs your store's tasks, schedules, and checklists.";

function GradientText({ children, style }: { children: string; style?: object | object[] }) {
  return (
    <MaskedView
      style={{ flexShrink: 0, alignSelf: "flex-start" }}
      maskElement={<Text style={[style, { backgroundColor: "transparent" }]}>{children}</Text>}
    >
      <LinearGradient
        colors={[...BRAND_TEXT]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.2 }}
      >
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

/**
 * Pressable's callback style does not apply in this app, so press feedback is
 * driven from state instead.
 */
function PressButton({
  onPress,
  style,
  pressedStyle,
  children,
  testID,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={pressed ? [style, pressedStyle] : style}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

function Backdrop({ width, height }: { width: number; height: number }) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  /**
   * Percentage sizes stick to the first layout on a Duo, so the field is drawn
   * in real pixels and remounted when the window changes. The dots fade from
   * the top to the bottom edge instead of ending in a hard line.
   */
  const key = `${w}x${h}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[...PAGE]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg key={key} width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`violet-${key}`} cx="85%" cy="22%" rx="70%" ry="45%">
            <Stop offset="0" stopColor="#9333ea" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#9333ea" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`cyan-${key}`} cx="0%" cy="95%" rx="60%" ry="40%">
            <Stop offset="0" stopColor="#22d3ee" stopOpacity="0.13" />
            <Stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </RadialGradient>
          <Pattern id={`dots-${key}`} width="24" height="24" patternUnits="userSpaceOnUse">
            <Circle cx="1" cy="1" r="1" fill="#fff" fillOpacity="0.07" />
          </Pattern>
          <SvgLinearGradient id={`dotsFade-${key}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="1" stopColor="#000000" />
          </SvgLinearGradient>
          <Mask id={`dotsMask-${key}`} x="0" y="0" width={w} height={h}>
            <Rect width={w} height={h} fill={`url(#dotsFade-${key})`} />
          </Mask>
        </Defs>
        <Rect width={w} height={h} fill={`url(#violet-${key})`} />
        <Rect width={w} height={h} fill={`url(#cyan-${key})`} />
        <Rect
          width={w}
          height={h}
          fill={`url(#dots-${key})`}
          mask={`url(#dotsMask-${key})`}
        />
      </Svg>
    </View>
  );
}

function NetworkPreview() {
  return (
    <View style={[styles.preview, styles.networkCard]}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewTitle}>Network</Text>
        <Text style={styles.previewMore}>•••</Text>
      </View>
      <View style={styles.tabs}>
        <Text style={[styles.tab, styles.tabOn]}>Feed</Text>
        <Text style={styles.tab}>Explore</Text>
        <Text style={styles.tab}>People</Text>
      </View>
      <View style={styles.post}>
        <View style={[styles.avatar, { backgroundColor: "#fce7f3" }]}>
          <Text style={[styles.avatarText, { color: "#be185d" }]}>VM</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.postName} numberOfLines={1}>
            Vera Mitchell <Text style={styles.postMeta}>· 2h</Text>
          </Text>
          <Text style={styles.postMeta} numberOfLines={1}>
            Retail Operations Leader
          </Text>
          <Text style={styles.postText}>Great team win today! Zero criticals on our safety walk.</Text>
        </View>
      </View>
      <View style={styles.win}>
        <Text style={styles.winValue}>100%</Text>
        <Text style={styles.winLabel}>
          Safety walk{"\n"}6 of 6 sections
        </Text>
      </View>
      <View style={styles.reactions}>
        <Heart size={11} color="#e11d74" fill="#e11d74" />
        <Text style={[styles.reactionText, { color: "#e11d74" }]}>46</Text>
        <MessageCircle size={11} color="#8a86a3" style={{ marginLeft: 10 }} />
        <Text style={styles.reactionText}>12</Text>
        <Text style={[styles.reactionText, { marginLeft: 10 }]}>Celebrate</Text>
      </View>
    </View>
  );
}

function WorkspacePreview() {
  return (
    <View style={[styles.preview, styles.workspaceCard]}>
      <View style={styles.previewHeader}>
        <Text style={[styles.previewTitle, { color: "#fff" }]}>Workspace</Text>
        <View style={styles.meBadge}>
          <Text style={styles.meBadgeText}>JM</Text>
        </View>
      </View>
      <View style={styles.store}>
        <LinearGradient colors={["#8b5cf6", "#d946ef"]} style={styles.storeMark}>
          <Text style={styles.storeMarkText}>A</Text>
        </LinearGradient>
        <Text style={styles.storeName}>Store #5101</Text>
      </View>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileTitle}>Tasks</Text>
          <Text style={styles.tileSub}>28 open</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileTitle}>Calendar</Text>
          <Text style={styles.tileSub}>4 events</Text>
        </View>
      </View>
      <Text style={styles.todayLabel}>TODAY</Text>
      {[
        { label: "Opening walk", done: true },
        { label: "Deli setup", done: false },
        { label: "Beverage check", done: false },
      ].map((row) => (
        <View key={row.label} style={styles.todayRow}>
          <View style={[styles.checkbox, row.done ? styles.checkboxOn : null]}>
            {row.done ? <Check size={9} color="#fff" strokeWidth={4} /> : null}
          </View>
          <Text style={[styles.todayText, row.done ? styles.todayDone : null]}>{row.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Previews({ scale = 1 }: { scale?: number }) {
  return (
    <View style={[styles.stage, { transform: [{ scale }] }]} pointerEvents="none">
      <NetworkPreview />
      <WorkspacePreview />
    </View>
  );
}

function Pitch({ compact, wide }: { compact: boolean; wide: boolean }) {
  const headline = [styles.headline, compact ? styles.headlineCompact : null, wide ? styles.headlineWide : null];
  return (
    <View>
      <View style={styles.eyebrow}>
        <Text style={styles.eyebrowText}>BUILT FOR FRONTLINE TEAMS</Text>
      </View>
      <View testID="welcome-headline">
        <Text style={headline}>Your Network.</Text>
        <Text style={headline}>Your Workspace.</Text>
        <GradientText style={headline}>One Platform.</GradientText>
      </View>
      <Text style={[styles.sub, compact ? styles.subCompact : null]}>{SUBHEADLINE}</Text>

      <PressButton
        onPress={() => router.push("/sign-up")}
        style={styles.ctaWrap}
        pressedStyle={styles.pressed}
        testID="welcome-get-started"
      >
        <LinearGradient
          colors={[...CTA]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.3 }}
          style={[styles.cta, compact ? styles.ctaCompact : null]}
        >
          <Text style={styles.ctaText}>Get Started</Text>
          <ArrowRight size={19} color="#fff" strokeWidth={2.6} />
        </LinearGradient>
      </PressButton>

      <PressButton
        onPress={() => router.push("/sign-in")}
        style={styles.ghostWrap}
        pressedStyle={styles.pressed}
        testID="welcome-sign-in"
      >
        <View style={[styles.ghost, compact ? styles.ctaCompact : null]}>
          <Text style={styles.ghostText}>Log In</Text>
        </View>
      </PressButton>

      <View style={[styles.trust, compact ? styles.trustCompact : null]}>
        {TRUST_POINTS.map((point) => (
          <View key={point} style={styles.trustItem}>
            <CircleCheck size={14} color="#c4b5fd" strokeWidth={2.2} />
            <Text style={styles.trustText}>{point}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const { height, width } = useWindowDimensions();
  /**
   * Landscape tablets and unfolded phones get the website's own arrangement:
   * the pitch in a column on the left and the app previews beside it.
   */
  const wide = width >= SPLIT_MIN_WIDTH && width / height >= SPLIT_MIN_ASPECT;
  const compact = !wide && height < 760;

  /**
   * Child effects run before their parents', so the root layout's dark status
   * bar lands after this screen's and wins on a cold start. Re-applying on
   * focus puts it back, and restores it for the light pages on the way out.
   */
  useFocusEffect(
    React.useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, []),
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Backdrop width={width} height={height} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {wide ? (
          <View style={styles.wideRow}>
            <View style={styles.wideCopy}>
              <Image
                source={require("@/assets/alenio-logo-white.png")}
                style={[styles.logo, { marginBottom: 28 }]}
                resizeMode="contain"
              />
              <Pitch compact={false} wide />
            </View>
            <View style={styles.wideStage}>
              <Previews scale={1.15} />
            </View>
          </View>
        ) : (
          <View style={styles.page}>
            <Image
              source={require("@/assets/alenio-logo-white.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.stageSlot}>
              <Previews scale={compact ? 0.8 : 1} />
            </View>
            <Pitch compact={compact} wide={false} />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE[0] },
  safe: { flex: 1 },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 6 },
  logo: { width: 112, height: 30 },

  stageSlot: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 0 },
  stage: { width: 350, height: 268 },
  wideRow: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 44 },
  wideCopy: { flex: 1, maxWidth: 420 },
  wideStage: { flex: 1, alignItems: "center", justifyContent: "center" },

  preview: {
    position: "absolute",
    borderRadius: 20,
    padding: 12,
    shadowColor: "#050214",
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  networkCard: {
    left: 0,
    top: 0,
    width: 226,
    backgroundColor: "#FFFFFF",
    transform: [{ rotate: "-4deg" }],
  },
  workspaceCard: {
    right: 0,
    top: 64,
    width: 168,
    backgroundColor: "#1b1240",
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.22)",
    transform: [{ rotate: "4deg" }],
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  previewTitle: { fontSize: 13, fontWeight: "700", color: "#14112a" },
  previewMore: { fontSize: 11, color: "#8a86a3" },
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: 9,
    backgroundColor: "#f1f0f7",
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 4,
    borderRadius: 7,
    overflow: "hidden",
    fontSize: 10,
    fontWeight: "600",
    color: "#6b6785",
  },
  tabOn: { backgroundColor: "#FFFFFF", color: "#6d28d9" },
  post: { flexDirection: "row", gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 10, fontWeight: "700" },
  postName: { fontSize: 11.5, fontWeight: "700", color: "#14112a" },
  postMeta: { fontSize: 9.5, fontWeight: "400", color: "#8a86a3" },
  postText: { marginTop: 5, maxWidth: 130, fontSize: 11, lineHeight: 15, color: "#2a2640" },
  win: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    alignSelf: "flex-start",
    marginTop: 9,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f3efff",
  },
  winValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5, color: "#6d28d9" },
  winLabel: { fontSize: 9.5, lineHeight: 12, color: "#6b6785" },
  reactions: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 8 },
  reactionText: { fontSize: 10, color: "#8a86a3", fontWeight: "600" },

  meBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fbbf24",
    alignItems: "center",
    justifyContent: "center",
  },
  meBadgeText: { fontSize: 8, fontWeight: "800", color: "#3b2300" },
  store: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 9,
  },
  storeMark: { width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  storeMarkText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  storeName: { fontSize: 11.5, fontWeight: "700", color: "#fff" },
  tiles: { flexDirection: "row", gap: 6, marginBottom: 9 },
  tile: { flex: 1, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.07)" },
  tileTitle: { fontSize: 10.5, fontWeight: "700", color: "#fff" },
  tileSub: { fontSize: 9, color: "#c4b5fd", marginTop: 1 },
  todayLabel: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.6, color: "#c4b5fd", marginBottom: 3 },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  checkbox: {
    width: 13,
    height: 13,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#8b5cf6", borderColor: "#8b5cf6" },
  todayText: { fontSize: 10.5, color: "#fff" },
  todayDone: { textDecorationLine: "line-through", color: "rgba(255,255,255,0.5)" },

  eyebrow: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.25)",
    backgroundColor: "rgba(168,85,247,0.18)",
    marginBottom: 14,
  },
  eyebrowText: { fontSize: 10.5, fontWeight: "700", letterSpacing: 1.5, color: "#d8c4ff" },
  headline: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: "#FFFFFF",
    includeFontPadding: false,
  },
  headlineCompact: { fontSize: 31, lineHeight: 35 },
  headlineWide: { fontSize: 44, lineHeight: 49, letterSpacing: -1.5 },
  sub: { marginTop: 12, fontSize: 14.5, lineHeight: 20, color: "rgba(255,255,255,0.72)" },
  subCompact: { marginTop: 8, fontSize: 13, lineHeight: 18 },

  ctaWrap: { alignSelf: "stretch", marginTop: 20 },
  cta: {
    minHeight: 54,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaCompact: { minHeight: 48 },
  ctaText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  ghostWrap: { alignSelf: "stretch", marginTop: 10 },
  ghost: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  pressed: { opacity: 0.85 },

  trust: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8, marginTop: 18 },
  trustCompact: { marginTop: 12 },
  trustItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  trustText: { fontSize: 12, color: "rgba(255,255,255,0.72)" },
});
