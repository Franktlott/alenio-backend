import React, { useEffect } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LoadingIllustration } from "./LoadingIllustration";
import { ProgressChecklist } from "./ProgressChecklist";
import { SecurityFooter } from "./SecurityFooter";
import { AUTH_LOADING_COLORS } from "./types";

type AuthLoadingScreenProps = {
  activeIndex: number;
  allDone?: boolean;
  exiting?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onBackToSignIn?: () => void;
  subtitle?: string;
};

export function AuthLoadingScreen({
  activeIndex,
  allDone = false,
  exiting = false,
  error = null,
  onRetry,
  onBackToSignIn,
  subtitle = "Securely signing you in with Microsoft",
}: AuthLoadingScreenProps) {
  const { height } = useWindowDimensions();
  const opacity = useSharedValue(1);
  const contentY = useSharedValue(8);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    contentY.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) });
  }, [contentY, opacity]);

  useEffect(() => {
    if (exiting && !error) {
      opacity.value = withTiming(0, { duration: 320, easing: Easing.inOut(Easing.quad) });
    }
  }, [error, exiting, opacity]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: contentY.value }],
  }));

  return (
    <View style={styles.root} testID="auth-loading-screen">
      <LinearGradient
        colors={["#F8FAFC", "#EEF2FF", "#F8FAFC"]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.radialHint} pointerEvents="none" />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { minHeight: Math.max(height - 24, 640) },
          ]}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.inner, fadeStyle]}>
            <Image
              source={require("@/assets/alenio-logo.png")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Alenio"
            />

            <Text style={styles.title} accessibilityRole="header">
              {error ? "Sign-in issue" : "Connecting your workspace"}
            </Text>
            <Text style={styles.subtitle}>
              {error ? "We could not finish connecting your Microsoft account." : subtitle}
            </Text>

            {!error ? (
              <>
                <LoadingIllustration />
                <View style={styles.progressWrap}>
                  <ProgressChecklist activeIndex={activeIndex} allDone={allDone} />
                </View>
              </>
            ) : (
              <View style={styles.errorCard}>
                <Text style={styles.errorText} testID="auth-callback-error">
                  {error}
                </Text>
                {onRetry ? (
                  <TouchableOpacity style={styles.primaryBtn} onPress={onRetry} testID="auth-loading-retry">
                    <Text style={styles.primaryBtnText}>Try again</Text>
                  </TouchableOpacity>
                ) : null}
                {onBackToSignIn ? (
                  <TouchableOpacity onPress={onBackToSignIn} testID="auth-callback-back">
                    <Text style={styles.link}>Back to sign in</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <SecurityFooter />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AUTH_LOADING_COLORS.background,
  },
  radialHint: {
    position: "absolute",
    top: "18%",
    alignSelf: "center",
    width: "88%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(124, 58, 237, 0.07)",
  },
  safe: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  inner: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    alignItems: "center",
  },
  logo: {
    width: 148,
    height: 44,
    marginBottom: 18,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    color: AUTH_LOADING_COLORS.title,
    textAlign: "center",
    letterSpacing: -0.4,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: AUTH_LOADING_COLORS.subtitle,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  progressWrap: {
    width: "100%",
    marginTop: 8,
    marginBottom: 20,
  },
  errorCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginVertical: 24,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 22,
  },
  primaryBtn: {
    backgroundColor: AUTH_LOADING_COLORS.brandBlue,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginBottom: 12,
    width: "100%",
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  link: {
    color: AUTH_LOADING_COLORS.brandBlue,
    fontWeight: "600",
    fontSize: 15,
    paddingVertical: 8,
  },
});
