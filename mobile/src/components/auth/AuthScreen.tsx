import React, { createContext, useContext, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowRight, ChevronLeft } from "lucide-react-native";
import { SPLIT_MIN_ASPECT, SPLIT_MIN_WIDTH } from "@/lib/adaptive-layout";

/**
 * The auth pages are the light half of the welcome screen and the website
 * hero: the same violet, brand text gradient and CTA, on a pale page.
 */
export const AUTH_ACCENT = "#6d28d9";
const BRAND_TEXT = ["#22d3ee", "#818cf8", "#d946ef"] as const;
const CTA = ["#8b5cf6", "#a855f7", "#d946ef"] as const;

export const AUTH_INPUT_CLASS =
  "h-[56px] rounded-[14px] border border-[#E9E5F5] bg-[#FAF9FE] pl-[50px] pr-4 text-[15px] text-[#14112a]";
export const AUTH_INPUT_CLASS_DARK =
  "h-[56px] rounded-[14px] border border-white/15 bg-white/5 pl-[50px] pr-4 text-[15px] text-white";
export const AUTH_CODE_INPUT_CLASS =
  "h-[56px] rounded-[14px] border border-[#E9E5F5] bg-[#FAF9FE] px-4 text-center text-[18px] tracking-widest text-[#14112a]";
export const AUTH_CODE_INPUT_CLASS_DARK =
  "h-[56px] rounded-[14px] border border-white/15 bg-white/5 px-4 text-center text-[18px] tracking-widest text-white";
export const AUTH_PLACEHOLDER_DARK = "rgba(255,255,255,0.42)";
export const AUTH_ICON_DARK = "#c4b5fd";

function AuthBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["#F3EEFF", "#FAF8FF", "#FFFFFF"]}
        locations={[0, 0.32, 0.6]}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="authViolet" cx="88%" cy="4%" rx="65%" ry="32%">
            <Stop offset="0" stopColor="#a855f7" stopOpacity="0.2" />
            <Stop offset="1" stopColor="#a855f7" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="authCyan" cx="0%" cy="30%" rx="45%" ry="22%">
            <Stop offset="0" stopColor="#22d3ee" stopOpacity="0.08" />
            <Stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </RadialGradient>
          <Pattern id="authDots" width="24" height="24" patternUnits="userSpaceOnUse">
            <Circle cx="1" cy="1" r="1" fill="#6d28d9" fillOpacity="0.08" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#authViolet)" />
        <Rect width="100%" height="100%" fill="url(#authCyan)" />
        <Rect width="100%" height="34%" fill="url(#authDots)" />
      </Svg>
    </View>
  );
}

function BrandGradientText({ children, style }: { children: string; style?: object | object[] }) {
  return (
    <MaskedView
      style={{ flexShrink: 0 }}
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
 * These pages are often the first thing in their navigator — opened cold, or
 * reached after a redirect that replaced the history — so a plain back() has
 * nothing to pop and the navigator complains. Falling back to the welcome page
 * gives the arrow somewhere to go in every case.
 */
export function authGoBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/welcome");
}

/**
 * Shared so the pieces of an auth page agree on when the page is split: the
 * card, the heading and the screens' own footers all change shape together.
 */
export function useAuthWideLayout(): boolean {
  const { width, height } = useWindowDimensions();
  return width >= SPLIT_MIN_WIDTH && width / height >= SPLIT_MIN_ASPECT;
}

export type AuthTone = "light" | "dark";

/** Lets the shared pieces follow the page's tone without every screen passing it down. */
const AuthToneContext = createContext<AuthTone>("light");

export function useAuthTone(): AuthTone {
  return useContext(AuthToneContext);
}

/** The dark page is the welcome screen's: the site's hero purple under a dusk peak. */
function AuthDarkBackdrop() {
  const { width } = useWindowDimensions();
  const artHeight = Math.round(width * 0.75);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["#0d0726", "#1a0b45", "#160a3a"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Image
        source={require("@/assets/alenio-auth-dusk-mountain.jpg")}
        style={{ position: "absolute", top: 0, left: 0, width, height: artHeight }}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["rgba(13,7,38,0.55)", "rgba(13,7,38,0)", "rgba(26,11,69,0)", "#1a0b45"]}
        locations={[0, 0.22, 0.62, 1]}
        style={{ position: "absolute", top: 0, left: 0, width, height: artHeight + 2 }}
      />
    </View>
  );
}

type AuthScreenProps = {
  children: ReactNode;
  testID: string;
  scrollTestID?: string;
  onBack?: () => void;
  wrapContentInCard?: boolean;
  tone?: AuthTone;
};

export function AuthScreen({
  children,
  testID,
  scrollTestID,
  onBack,
  wrapContentInCard = true,
  tone = "light",
}: AuthScreenProps) {
  /**
   * Wide screens still centre a readable form column; there is no side hero
   * panel anymore, so the page paints its own full-bleed backdrop.
   */
  const wide = useAuthWideLayout();
  const dark = tone === "dark";

  const form = (
    <ScrollView
      className="flex-1"
      contentContainerStyle={[
        styles.scrollContent,
        wide ? styles.scrollContentWide : null,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      testID={scrollTestID}
    >
      <View style={[styles.column, wide ? styles.columnWide : null]}>
        <SafeAreaView edges={["top"]}>
          <View style={styles.brandRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Go back"
              activeOpacity={0.72}
              onPress={onBack}
              disabled={!onBack}
              style={[
                styles.backButton,
                dark ? styles.backButtonDark : null,
                !onBack ? styles.backButtonHidden : null,
              ]}
            >
              <ChevronLeft size={22} color={dark ? "#FFFFFF" : "#252C3A"} strokeWidth={2.2} />
            </TouchableOpacity>

            <Image
              source={
                dark
                  ? require("@/assets/alenio-logo-white.png")
                  : require("@/assets/alenio-logo.png")
              }
              style={styles.logo}
              resizeMode="contain"
            />

            <View style={styles.headerSpacer} />
          </View>
        </SafeAreaView>
        {wrapContentInCard ? <AuthCard>{children}</AuthCard> : children}
      </View>
    </ScrollView>
  );

  return (
    <AuthToneContext.Provider value={tone}>
      <View
        className="flex-1"
        style={{ backgroundColor: dark ? "#1a0b45" : "#FFFFFF" }}
        testID={testID}
      >
        <StatusBar style={dark ? "light" : "dark"} />
        {dark ? <AuthDarkBackdrop /> : <AuthBackdrop />}

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          {form}
        </KeyboardAvoidingView>
      </View>
    </AuthToneContext.Provider>
  );
}

export function AuthHeading({
  badge,
  badgeIcon,
  title,
  titleAccent,
  subtitle,
}: {
  badge?: string;
  badgeIcon?: ReactNode;
  title: string;
  /** Trailing words set in the brand gradient, as "One Platform." is on the site. */
  titleAccent?: string;
  subtitle: ReactNode;
}) {
  const wide = useAuthWideLayout();
  const dark = useAuthTone() === "dark";
  const titleStyle = [
    styles.headingTitle,
    dark ? styles.onDark : null,
    wide ? styles.headingTitleWide : null,
  ];
  return (
    <View style={[styles.heading, dark ? styles.headingDark : null, wide ? styles.headingWide : null]}>
      {/**
       * The badge repeats what the title says. A narrow screen has the room to
       * spend on the greeting; a landscape one needs it for the fields.
       */}
      {badge && !wide ? (
        <View style={[styles.badge, dark ? styles.badgeDark : null]}>
          {badgeIcon}
          <Text style={[styles.badgeText, dark ? styles.badgeTextDark : null]}>
            {badge.toUpperCase()}
          </Text>
        </View>
      ) : null}
      {titleAccent ? (
        <View style={styles.titleRow}>
          <Text style={titleStyle}>{title} </Text>
          <BrandGradientText style={titleStyle}>{titleAccent}</BrandGradientText>
        </View>
      ) : (
        <Text style={titleStyle}>{title}</Text>
      )}
      <Text
        style={[
          styles.headingSubtitle,
          dark ? styles.headingSubtitleDark : null,
          wide ? styles.headingSubtitleWide : null,
        ]}
      >
        {subtitle}
      </Text>
    </View>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  const dark = useAuthTone() === "dark";
  return (
    <View style={dark ? styles.cardDark : styles.card}>{children}</View>
  );
}

export function AuthField({
  label,
  icon,
  children,
  labelAction,
  className = "mb-5",
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  labelAction?: ReactNode;
  className?: string;
}) {
  const dark = useAuthTone() === "dark";
  return (
    <View className={className}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className={`text-[13px] font-bold ${dark ? "text-white" : "text-[#14112a]"}`}>
          {label}
        </Text>
        {labelAction}
      </View>
      <View className="relative justify-center">
        {icon ? (
          <View style={{ position: "absolute", left: 16, zIndex: 1 }}>
            {icon}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

export function AuthPrimaryButton({
  label,
  loading,
  disabled,
  onPress,
  testID,
  className = "",
}: {
  label: string;
  loading: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
  className?: string;
}) {
  return (
    <View className={className}>
      <LinearGradient
        colors={[...CTA]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.3 }}
        style={{
          height: 56,
          borderRadius: 14,
          shadowColor: "#a855f7",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 14,
          elevation: 5,
          opacity: disabled ? 0.65 : 1,
        }}
      >
        <TouchableOpacity
          className="flex-1 items-center justify-center rounded-[10px]"
          onPress={onPress}
          disabled={disabled || loading}
          activeOpacity={0.82}
          testID={testID}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <View className="flex-row items-center justify-center">
              <Text className="text-[16px] font-bold text-white">{label}</Text>
              <ArrowRight
                size={19}
                color="#FFFFFF"
                strokeWidth={2.4}
                style={{ marginLeft: 8 }}
              />
            </View>
          )}
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

export function AuthTextLink({
  label,
  onPress,
  testID,
  className = "mt-5",
}: {
  label: string;
  onPress: () => void;
  testID: string;
  className?: string;
}) {
  const dark = useAuthTone() === "dark";
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`items-center py-2 ${className}`}
      testID={testID}
    >
      <Text
        className={`text-[14px] font-semibold ${dark ? "text-[#c4b5fd]" : "text-[#6d28d9]"}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function AuthMessage({
  children,
  tone,
  testID,
}: {
  children: ReactNode;
  tone: "error" | "success";
  testID: string;
}) {
  if (tone === "error") {
    return (
      <View
        className="mb-4 rounded-[12px] border border-red-100 bg-red-50 px-4 py-3"
        testID={testID}
      >
        <Text className="text-[13px] leading-[18px] text-red-600">
          {children}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="mb-5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-4"
      testID={testID}
    >
      <Text className="text-sm font-medium text-emerald-700">{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 38,
  },
  /**
   * A form is only as wide as its longest field needs to be; past this the
   * inputs turn into stripes across a tablet and the eye loses the label it
   * started from. Narrower screens never reach the cap.
   */
  column: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    flexGrow: 1,
  },
  columnWide: {
    flexGrow: 0,
  },
  /**
   * Deliberately top-aligned rather than centred: these forms are taller than a
   * landscape viewport, and centring overflow pushes the logo and back button
   * off the top edge where a ScrollView cannot reach them.
   */
  scrollContentWide: {
    paddingBottom: 24,
  },
  brandRow: {
    height: 82,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E9EAF1",
    backgroundColor: "rgba(248,248,252,0.96)",
  },
  backButtonDark: {
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  backButtonHidden: {
    opacity: 0,
  },
  logo: {
    width: 130,
    height: 48,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  heading: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 24,
  },
  /** One left margin for the whole column: heading, labels, fields, buttons. */
  headingWide: {
    alignItems: "flex-start",
    paddingTop: 0,
    paddingBottom: 18,
  },
  badge: {
    minHeight: 26,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E4DCFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3EFFF",
    marginBottom: 14,
  },
  badgeText: {
    color: AUTH_ACCENT,
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  /** Leaves the peak in view between the logo and the greeting. */
  headingDark: {
    paddingTop: 92,
  },
  badgeDark: {
    borderColor: "rgba(196,181,253,0.3)",
    backgroundColor: "rgba(168,85,247,0.18)",
  },
  badgeTextDark: {
    color: "#E4D8FF",
  },
  onDark: {
    color: "#FFFFFF",
  },
  headingSubtitleDark: {
    color: "rgba(255,255,255,0.74)",
  },
  cardDark: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 24,
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  headingTitle: {
    color: "#14112a",
    fontSize: 30,
    lineHeight: 37,
    fontWeight: "800",
    letterSpacing: -0.8,
    textAlign: "center",
  },
  headingTitleWide: {
    fontSize: 28,
    lineHeight: 34,
    textAlign: "left",
  },
  headingSubtitle: {
    marginTop: 6,
    color: "#6b6785",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  headingSubtitleWide: {
    fontSize: 14.5,
    textAlign: "left",
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#EDE8FA",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 27,
    shadowColor: "#2a0f63",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 4,
  },
});
