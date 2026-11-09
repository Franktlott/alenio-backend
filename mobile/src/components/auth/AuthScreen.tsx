import React, { type ReactNode } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowRight, ChevronLeft } from "lucide-react-native";
import { SPLIT_MIN_ASPECT, SPLIT_MIN_WIDTH } from "@/lib/adaptive-layout";

export const AUTH_INPUT_CLASS =
  "h-[56px] rounded-[14px] border border-[#E7E8F0] bg-[#F7F7FC] pl-[50px] pr-4 text-[15px] text-[#172033]";
export const AUTH_CODE_INPUT_CLASS =
  "h-[56px] rounded-[14px] border border-[#E7E8F0] bg-[#F7F7FC] px-4 text-center text-[18px] tracking-widest text-[#172033]";

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

type AuthScreenProps = {
  children: ReactNode;
  testID: string;
  scrollTestID?: string;
  onBack?: () => void;
  wrapContentInCard?: boolean;
};

export function AuthScreen({
  children,
  testID,
  scrollTestID,
  onBack,
  wrapContentInCard = true,
}: AuthScreenProps) {
  /**
   * The page is only the column here: on wide screens the (auth) layout owns the
   * row and the hero panel beside it, so this renders into the space it is given.
   */
  const wide = useAuthWideLayout();

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
              style={[styles.backButton, !onBack ? styles.backButtonHidden : null]}
            >
              <ChevronLeft size={22} color="#252C3A" strokeWidth={2.2} />
            </TouchableOpacity>

            <Image
              source={require("@/assets/alenio-logo.png")}
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
    <View className="flex-1 bg-white" testID={testID}>
      <StatusBar style="dark" />
      {!wide ? (
        <View pointerEvents="none" style={styles.cornerArtwork}>
          <View style={[styles.cornerCircle, styles.cornerCircleLarge]} />
          <View style={[styles.cornerCircle, styles.cornerCircleMedium]} />
          <View style={[styles.cornerCircle, styles.cornerCircleSmall]} />
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        {form}
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthHeading({
  badge,
  badgeIcon,
  title,
  subtitle,
}: {
  badge?: string;
  badgeIcon?: ReactNode;
  title: string;
  subtitle: ReactNode;
}) {
  const wide = useAuthWideLayout();
  return (
    <View style={[styles.heading, wide ? styles.headingWide : null]}>
      {/**
       * The badge repeats what the title says. A narrow screen has the room to
       * spend on the greeting; a landscape one needs it for the fields.
       */}
      {badge && !wide ? (
        <View style={styles.badge}>
          {badgeIcon}
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={[styles.headingTitle, wide ? styles.headingTitleWide : null]}>
        {title}
      </Text>
      <Text
        style={[styles.headingSubtitle, wide ? styles.headingSubtitleWide : null]}
      >
        {subtitle}
      </Text>
    </View>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  const wide = useAuthWideLayout();
  /**
   * Split layouts drop the card's border, shadow and gutters: the hero panel
   * beside it already gives the page its structure, so an outline here only
   * nests a box in a box and costs the fields their width.
   */
  return <View style={wide ? styles.cardPlain : styles.card}>{children}</View>;
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
  return (
    <View className={className}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-[13px] font-bold text-[#202838]">{label}</Text>
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
        colors={["#3677F5", "#5B4CF4", "#9A34EE"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.15 }}
        style={{
          height: 56,
          borderRadius: 14,
          shadowColor: "#6844EA",
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.22,
          shadowRadius: 10,
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
                strokeWidth={2}
                style={{ marginLeft: 16 }}
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
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`items-center py-2 ${className}`}
      testID={testID}
    >
      <Text className="text-[14px] font-medium text-[#4F35D9]">{label}</Text>
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
  cornerArtwork: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 190,
    height: 210,
    overflow: "hidden",
  },
  cornerCircle: {
    position: "absolute",
    borderRadius: 999,
  },
  cornerCircleLarge: {
    width: 184,
    height: 184,
    top: -92,
    right: -58,
    backgroundColor: "rgba(70, 133, 255, 0.10)",
  },
  cornerCircleMedium: {
    width: 128,
    height: 128,
    top: 34,
    right: -49,
    backgroundColor: "rgba(113, 74, 246, 0.11)",
  },
  cornerCircleSmall: {
    width: 92,
    height: 92,
    top: -15,
    right: 38,
    backgroundColor: "rgba(96, 198, 255, 0.10)",
  },
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
    minHeight: 28,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(112, 76, 246, 0.09)",
    marginBottom: 13,
  },
  badgeText: {
    color: "#6741E6",
    fontSize: 12,
    fontWeight: "700",
  },
  headingTitle: {
    color: "#111827",
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
    marginTop: 5,
    color: "#727C90",
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
    borderColor: "#ECECF3",
    backgroundColor: "rgba(255,255,255,0.98)",
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 27,
    shadowColor: "#435071",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 4,
  },
  cardPlain: {
    backgroundColor: "transparent",
  },
});
