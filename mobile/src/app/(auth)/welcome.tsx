import React, { useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
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
import { ArrowRight, Calendar, Check, ChevronRight, CircleCheck, User, Users } from "lucide-react-native";
import { Badge, PriorityBadge } from "@/components/ui";
import { SPLIT_MIN_ASPECT, SPLIT_MIN_WIDTH } from "@/lib/adaptive-layout";

/** Same purple phone field. Only the status bar changes by platform. */
const WORKSPACE_DEVICE = Platform.select({
  ios: require("@/assets/workspace-ios.png"),
  android: require("@/assets/workspace-android.png"),
  default: require("@/assets/workspace-ios.png"),
});
const DEVICE_ASPECT = 3 / 4;
const DEVICE_WIDTH = 196;
const DEVICE_HEIGHT = Math.round(DEVICE_WIDTH / DEVICE_ASPECT);

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

const TASK_ROWS = [
  {
    title: "Complete food safety checklist",
    when: "Today · 9:00 AM",
    done: false,
    priority: "high" as const,
    priorityLabel: "High",
  },
  {
    title: "Review weekly report",
    when: "Yesterday",
    done: true,
    priority: null,
    priorityLabel: "",
  },
  {
    title: "Check cooler temps",
    when: "Today · 2:00 PM",
    done: false,
    priority: "medium" as const,
    priorityLabel: "Medium",
  },
];

function TasksPromo() {
  return (
    <View style={[styles.promoCard, styles.tasksCard]}>
      <View style={styles.cardHeader}>
        <View style={styles.taskMark}>
          <Check size={11} color="#FFFFFF" strokeWidth={3} />
        </View>
        <Text style={styles.cardTitle}>Tasks</Text>
        <Text style={styles.viewAll}>View All</Text>
        <ChevronRight size={12} color="#7C3AED" strokeWidth={2.4} />
      </View>
      <View style={styles.tabs}>
        <Text style={[styles.tab, styles.tabOn]}>My Tasks</Text>
        <Text style={styles.tab}>Team</Text>
        <Text style={styles.tab}>All</Text>
      </View>
      {TASK_ROWS.map((row) => (
        <View key={row.title} style={styles.taskRow}>
          <View style={[styles.checkbox, row.done ? styles.checkboxOn : null]}>
            {row.done ? <Check size={9} color="#FFFFFF" strokeWidth={3.4} /> : null}
          </View>
          <View style={styles.taskCopy}>
            <Text
              style={[styles.taskTitle, row.done ? styles.taskDone : null]}
              numberOfLines={1}
            >
              {row.title}
            </Text>
            <View style={styles.taskMeta}>
              <Text style={styles.taskWhen} numberOfLines={1}>
                {row.when}
              </Text>
              {row.done ? (
                <Badge tone="success" size="sm">
                  Done
                </Badge>
              ) : (
                <PriorityBadge priority={row.priority!} label={row.priorityLabel} />
              )}
            </View>
          </View>
        </View>
      ))}
      <View style={styles.moreRow}>
        <Calendar size={12} color="#7C3AED" strokeWidth={2.2} />
        <Text style={styles.moreText}>3 more tasks</Text>
        <ChevronRight size={12} color="#94A3B8" strokeWidth={2.4} />
      </View>
    </View>
  );
}

function DevelopmentPromo() {
  const size = 52;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * 0.87;
  return (
    <View style={[styles.promoCard, styles.sideCard, styles.developmentCard]}>
      <View style={styles.sideHeader}>
        <View style={styles.sideIcon}>
          <User size={11} color="#7C3AED" strokeWidth={2.4} />
        </View>
        <Text style={styles.sideTitle}>Development</Text>
      </View>
      <View style={styles.ringWrap}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#E9D5FF"
            strokeWidth={stroke}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#16A34A"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <Text style={styles.ringValue}>87%</Text>
      </View>
      <Text style={styles.onTrack}>On Track</Text>
      <Text style={styles.checkInLabel}>Next Check-in</Text>
      <Text style={styles.checkInDate}>Nov 28</Text>
    </View>
  );
}

function TeamPromo() {
  return (
    <View style={[styles.promoCard, styles.sideCard, styles.teamCard]}>
      <View style={styles.sideHeader}>
        <View style={styles.sideIcon}>
          <Users size={11} color="#7C3AED" strokeWidth={2.4} />
        </View>
        <Text style={styles.sideTitle}>Team</Text>
      </View>
      <Text style={styles.memberCount}>42</Text>
      <Text style={styles.memberLabel}>Members</Text>
      <View style={styles.faces}>
        {[
          require("@/assets/connection-person-woman-teal.png"),
          require("@/assets/connection-person-man.png"),
          require("@/assets/connection-person-woman-curls.png"),
        ].map((source, index) => (
          <Image
            key={index}
            source={source}
            style={[styles.face, index > 0 ? styles.faceOverlap : null]}
          />
        ))}
      </View>
      <View style={styles.sideLink}>
        <Text style={styles.viewAll}>View All</Text>
        <ChevronRight size={11} color="#7C3AED" strokeWidth={2.4} />
      </View>
    </View>
  );
}

function Previews({ scale = 1 }: { scale?: number }) {
  return (
    <View
      style={[styles.stage, { transform: [{ scale }] }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="welcome-device-promo"
    >
      <View style={styles.deviceFrame}>
        <Image
          source={WORKSPACE_DEVICE}
          style={styles.deviceImage}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
      <DevelopmentPromo />
      <TeamPromo />
      <TasksPromo />
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

  deviceFrame: {
    position: "absolute",
    width: DEVICE_WIDTH,
    height: DEVICE_HEIGHT,
    left: (350 - DEVICE_WIDTH) / 2,
    top: 4,
    borderRadius: 28,
    overflow: "hidden",
  },
  deviceImage: {
    width: "100%",
    height: "100%",
  },
  promoCard: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    shadowColor: "#050214",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  tasksCard: {
    width: 214,
    left: (350 - 214) / 2,
    top: 46,
    zIndex: 3,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sideCard: {
    width: 112,
    zIndex: 2,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: "center",
  },
  developmentCard: {
    left: 0,
    top: 28,
    transform: [{ rotate: "-8deg" }],
  },
  teamCard: {
    right: 0,
    top: 64,
    transform: [{ rotate: "7deg" }],
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  taskMark: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: "800", color: "#14112A" },
  viewAll: { fontSize: 10, fontWeight: "700", color: "#7C3AED" },
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: 9,
    backgroundColor: "#F4F1FB",
    marginTop: 8,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 4,
    borderRadius: 7,
    overflow: "hidden",
    fontSize: 10,
    fontWeight: "600",
    color: "#6B6785",
  },
  tabOn: { backgroundColor: "#FFFFFF", color: "#6D28D9" },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingVertical: 5,
  },
  checkbox: {
    width: 14,
    height: 14,
    marginTop: 1,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  taskCopy: { flex: 1, minWidth: 0 },
  taskTitle: { fontSize: 11, fontWeight: "700", color: "#14112A" },
  taskDone: { color: "#64748B", textDecorationLine: "line-through" },
  taskMeta: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  taskWhen: { flexShrink: 1, fontSize: 9.5, color: "#64748B" },
  moreRow: {
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E7E5EF",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  moreText: { flex: 1, fontSize: 11, fontWeight: "600", color: "#334155" },
  sideHeader: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sideIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sideTitle: { flex: 1, fontSize: 11, fontWeight: "800", color: "#14112A" },
  ringWrap: {
    marginTop: 8,
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  ringValue: {
    position: "absolute",
    fontSize: 12,
    fontWeight: "800",
    color: "#14112A",
  },
  onTrack: { marginTop: 4, fontSize: 11, fontWeight: "800", color: "#16A34A" },
  checkInLabel: { marginTop: 6, fontSize: 9, color: "#64748B" },
  checkInDate: { fontSize: 11, fontWeight: "800", color: "#14112A" },
  memberCount: { marginTop: 8, fontSize: 28, lineHeight: 30, fontWeight: "800", color: "#14112A" },
  memberLabel: { fontSize: 11, fontWeight: "600", color: "#64748B" },
  faces: { flexDirection: "row", marginTop: 8 },
  face: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    backgroundColor: "#EDE9FE",
  },
  faceOverlap: { marginLeft: -6 },
  sideLink: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 1 },

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
