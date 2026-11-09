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
import { StatusBar, setStatusBarStyle } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { ArrowRight, Lock } from "lucide-react-native";
import { SPLIT_MIN_ASPECT, SPLIT_MIN_WIDTH } from "@/lib/adaptive-layout";

const GRADIENT = ["#4361EE", "#7C3AED"] as const;
/**
 * The brand indigo turns to a bruise against a dark scrim. These are the same
 * two hues lifted until the word reads as an accent rather than a smudge.
 */
const GRADIENT_ON_DARK = ["#9DBBFF", "#D3B2FF"] as const;

const HERO_IMAGE = require("@/assets/alenio-welcome-team-hero-mobile.jpg");

/**
 * Heavy enough at the foot to carry white body text over a bright grocery
 * aisle, and light enough at the head that the photograph still reads as a
 * room rather than a texture.
 */
const SCRIM = [
  "rgba(8,12,22,0.12)",
  "rgba(8,12,22,0.34)",
  "rgba(8,12,22,0.86)",
  "#080C16",
] as const;

/**
 * Placeholder wording. These name capability areas rather than certifications
 * on purpose — swap in the real compliance claims before release, and do not
 * put a standard on screen that has not actually been audited.
 */
const TRUST_POINTS = ["Enterprise security", "Single sign-on", "Role-based access"];

const SUBHEADLINE = "Connect with your team, stay on top\nof work, and grow together.";
/** The wide column is narrower than the phone's, so it picks its own breaks. */
const SUBHEADLINE_WIDE = "Connect with your team, stay on top of work, and grow together.";

function GradientText({
  children,
  style,
  colors = GRADIENT,
}: {
  children: string;
  style?: object | object[];
  colors?: readonly [string, string];
}) {
  return (
    <MaskedView
      style={{ flexShrink: 0 }}
      maskElement={<Text style={[style, { backgroundColor: "transparent" }]}>{children}</Text>}
    >
      <LinearGradient colors={[...colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
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

export default function WelcomeScreen() {
  const { height, width } = useWindowDimensions();
  /**
   * Landscape tablets and unfolded phones read as a marketing page, not a tall
   * phone screen: the pitch holds a readable column on one side and the hero
   * becomes a panel on the other, instead of a full-width button and a photo
   * cropped to a letterbox.
   */
  const wide = width >= SPLIT_MIN_WIDTH && width / height >= SPLIT_MIN_ASPECT;
  const isShort = !wide && height < 760;
  const isNarrow = width < 375;

  if (!wide) {
    return (
      <DarkWelcome isShort={isShort} isNarrow={isNarrow} />
    );
  }

  const headlineStyle = [styles.headline, styles.headlineWide];

  return (
    <View style={styles.rootLight}>
      <StatusBar style="dark" />
      <View style={styles.wideColumn}>
        <View style={styles.introWide}>
          <Image
            source={require("@/assets/alenio-logo.png")}
            style={styles.logoWide}
            resizeMode="contain"
          />
          <Text style={styles.eyebrowLight}>WORKFORCE OPERATIONS</Text>
          <View style={styles.headlineWrapWide} testID="welcome-headline">
            <Text style={headlineStyle}>Where people</Text>
            <View style={styles.headlineLineWide}>
              <Text style={headlineStyle}>and work </Text>
              <GradientText style={headlineStyle}>connect.</GradientText>
            </View>
          </View>
          <Text style={[styles.subheadline, styles.subheadlineWide]} numberOfLines={2}>
            {SUBHEADLINE_WIDE}
          </Text>
        </View>

        <View style={styles.bottomWide}>
          <View style={styles.ctaWrapWide}>
            <PressButton
              onPress={() => router.push("/sign-up")}
              pressedStyle={styles.ctaPressed}
              testID="welcome-get-started"
            >
              <LinearGradient
                colors={[...GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>Get Started</Text>
                <ArrowRight size={20} color="#fff" strokeWidth={2.5} />
              </LinearGradient>
            </PressButton>
          </View>

          <Pressable
            onPress={() => router.push("/sign-in")}
            style={[styles.signInRow, styles.signInRowWide]}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            testID="welcome-sign-in"
          >
            <Text style={styles.signInMuted}>Already have an account? </Text>
            <Text style={styles.signInLink}>Sign in</Text>
          </Pressable>

          <View style={[styles.secureRow, styles.secureRowWide]}>
            <Lock size={11} color="#94A3B8" strokeWidth={2.2} />
            <Text style={styles.secureText}>Your data is secure</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * The phone layout treats the photograph as the room the product lives in:
 * full bleed, graded down to near-black at the foot so a single left-aligned
 * column of type can sit on it. The CTA is white rather than the brand
 * gradient because a saturated fill is the loudest consumer cue on the page,
 * and the colour is better spent on one word of the headline.
 */
function DarkWelcome({ isShort, isNarrow }: { isShort: boolean; isNarrow: boolean }) {
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

  const headlineStyle = [
    styles.headline,
    styles.headlineDark,
    isShort ? styles.headlineShort : null,
    isNarrow ? styles.headlineNarrow : null,
  ];

  return (
    <View style={styles.rootDark}>
      <StatusBar style="light" />
      <View style={styles.heroBand} pointerEvents="none">
        <Image
          source={HERO_IMAGE}
          style={styles.heroImage}
          resizeMode="cover"
          accessibilityRole="image"
          accessibilityLabel="Frontline team members using Alenio"
        />
        <LinearGradient
          colors={[...SCRIM]}
          locations={[0, 0.46, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/** The ceiling in this photograph is the brightest thing on screen
         * and the wordmark and clock sit right on it. */}
        <LinearGradient
          colors={["rgba(8,12,22,0.66)", "rgba(8,12,22,0.22)", "rgba(8,12,22,0)"]}
          style={styles.heroTopScrim}
        />
      </View>

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={[styles.page, isShort ? styles.pageShort : null]}>
          <Image
            source={require("@/assets/alenio-logo-white.png")}
            style={[styles.logoDark, isShort ? styles.logoDarkShort : null]}
            resizeMode="contain"
          />

          <View style={styles.bottomGroup}>
            <Text style={styles.eyebrow}>WORKFORCE OPERATIONS</Text>

            <View style={styles.headlineWrapDark} testID="welcome-headline">
              <Text style={headlineStyle}>Where people</Text>
              <View style={styles.headlineLineDark}>
                <Text style={headlineStyle}>and work </Text>
                <GradientText style={headlineStyle} colors={GRADIENT_ON_DARK}>
                  connect.
                </GradientText>
              </View>
            </View>

            <Text
              style={[styles.subheadlineDark, isShort ? styles.subheadlineShort : null]}
              numberOfLines={2}
            >
              {SUBHEADLINE}
            </Text>

            <PressButton
              onPress={() => router.push("/sign-up")}
              style={styles.ctaDarkWrap}
              pressedStyle={styles.ctaPressed}
              testID="welcome-get-started"
            >
              <View style={[styles.ctaDark, isShort ? styles.ctaShort : null]}>
                <Text style={styles.ctaDarkText}>Get Started</Text>
                <ArrowRight size={19} color="#0B1220" strokeWidth={2.6} />
              </View>
            </PressButton>

            <PressButton
              onPress={() => router.push("/sign-in")}
              style={styles.ghostWrap}
              pressedStyle={styles.ghostPressed}
              testID="welcome-sign-in"
            >
              <View style={[styles.ghost, isShort ? styles.ctaShort : null]}>
                <Text style={styles.ghostText}>Sign in</Text>
              </View>
            </PressButton>

            <View style={styles.trustStrip}>
              {TRUST_POINTS.map((point, index) => (
                <React.Fragment key={point}>
                  {index > 0 ? <View style={styles.trustDot} /> : null}
                  <Text style={styles.trustText}>{point}</Text>
                </React.Fragment>
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootLight: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  rootDark: {
    flex: 1,
    backgroundColor: "#080C16",
  },
  /**
   * A band rather than a full bleed. The photograph is 2:3 with its two
   * subjects side by side, so cropping it to a phone's proportions throws one
   * of them off the edge. Held to the top two thirds it keeps its own shape,
   * and the scrim's last stop is the page colour, so the lower edge dissolves
   * instead of ending.
   */
  heroBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "66%",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroTopScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 190,
  },
  safe: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 8,
  },
  pageShort: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  wideColumn: {
    flex: 1,
    justifyContent: "center",
    paddingLeft: 44,
    paddingRight: 28,
    paddingVertical: 24,
  },

  logoDark: {
    width: 118,
    height: 37,
  },
  logoDarkShort: {
    width: 104,
    height: 33,
  },
  logoWide: {
    width: 164,
    height: 51,
    marginBottom: 18,
  },

  /**
   * A small label above a headline is the cheapest signal that a page was laid
   * out rather than assembled, and it gives the eye somewhere to start.
   */
  eyebrow: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.7,
    color: "rgba(255,255,255,0.58)",
    marginBottom: 12,
  },
  eyebrowLight: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.7,
    color: "#94A3B8",
    marginBottom: 12,
  },

  bottomGroup: {
    flexShrink: 0,
  },
  introWide: {
    alignItems: "flex-start",
  },

  headlineWrapDark: {
    alignItems: "flex-start",
    marginBottom: 10,
  },
  headlineWrapWide: {
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headlineLineDark: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
  },
  headlineLineWide: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headline: {
    fontSize: 32,
    fontWeight: "900",
    color: "#0F172A",
    lineHeight: 36,
    letterSpacing: -1,
    includeFontPadding: false,
  },
  headlineDark: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1.1,
    textAlign: "left",
  },
  headlineShort: {
    fontSize: 29,
    lineHeight: 33,
  },
  headlineNarrow: {
    fontSize: 30,
    lineHeight: 34,
  },
  headlineWide: {
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: -1.2,
    textAlign: "left",
  },

  subheadline: {
    fontSize: 13.5,
    color: "#64748B",
    lineHeight: 18,
    maxWidth: 300,
  },
  subheadlineWide: {
    fontSize: 15,
    lineHeight: 21,
    maxWidth: 340,
    textAlign: "left",
  },
  subheadlineDark: {
    fontSize: 14,
    lineHeight: 19.5,
    color: "rgba(255,255,255,0.74)",
    maxWidth: 330,
    marginBottom: 22,
  },
  subheadlineShort: {
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 16,
  },

  ctaWrapWide: {
    alignSelf: "stretch",
    maxWidth: 320,
  },
  cta: {
    minHeight: 52,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaShort: {
    minHeight: 48,
  },
  ctaPressed: {
    opacity: 0.88,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  ctaDarkWrap: {
    alignSelf: "stretch",
  },
  ctaDark: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaDarkText: {
    color: "#0B1220",
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  ghostWrap: {
    alignSelf: "stretch",
    marginTop: 10,
  },
  ghost: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostPressed: {
    opacity: 0.7,
  },
  ghostText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "700",
  },

  trustStrip: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.16)",
  },
  trustDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.34)",
    marginHorizontal: 9,
  },
  trustText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.56)",
    letterSpacing: 0.1,
  },

  bottomWide: {
    alignItems: "flex-start",
    paddingHorizontal: 0,
    marginTop: 30,
  },
  signInRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    minHeight: 41,
  },
  signInRowWide: {
    justifyContent: "flex-start",
    marginTop: 8,
  },
  signInMuted: {
    fontSize: 12.5,
    color: "#64748B",
  },
  signInLink: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#4361EE",
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 24,
  },
  secureRowWide: {
    justifyContent: "flex-start",
  },
  secureText: {
    fontSize: 11,
    color: "#94A3B8",
  },
});
