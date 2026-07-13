import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Check, LayoutDashboard, Lock, RefreshCw, Users } from "lucide-react-native";
import { AUTH_LOADING_COLORS, type AuthLoadingStepStatus } from "./types";

type LoadingStepProps = {
  title: string;
  status: AuthLoadingStepStatus;
  icon: "lock" | "users" | "sync" | "dashboard";
  isLast?: boolean;
};

function LeadingIcon({ icon }: { icon: LoadingStepProps["icon"] }) {
  const color = AUTH_LOADING_COLORS.brandBlue;
  const size = 18;
  if (icon === "lock") return <Lock size={size} color={color} strokeWidth={2.2} />;
  if (icon === "users") return <Users size={size} color={color} strokeWidth={2.2} />;
  if (icon === "sync") return <RefreshCw size={size} color={color} strokeWidth={2.2} />;
  return <LayoutDashboard size={size} color={color} strokeWidth={2.2} />;
}

function StatusIndicator({ status }: { status: AuthLoadingStepStatus }) {
  const spin = useSharedValue(0);
  const checkScale = useSharedValue(status === "done" ? 1 : 0.6);

  useEffect(() => {
    if (status === "active") {
      spin.value = 0;
      spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    }
    if (status === "done") {
      checkScale.value = 0.6;
      checkScale.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    }
  }, [status, spin, checkScale]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  if (status === "done") {
    return (
      <Animated.View style={[styles.statusDone, checkStyle]}>
        <Check size={14} color="#FFFFFF" strokeWidth={3} />
      </Animated.View>
    );
  }

  if (status === "active") {
    return (
      <Animated.View style={[styles.statusSpinner, spinStyle]}>
        <View style={styles.spinnerArc} />
      </Animated.View>
    );
  }

  return <View style={styles.statusPending} />;
}

export function LoadingStep({ title, status, icon, isLast }: LoadingStepProps) {
  return (
    <View style={[styles.row, !isLast && styles.rowGap]} accessibilityRole="text">
      <View style={styles.leading}>
        <LeadingIcon icon={icon} />
      </View>
      <Animated.Text
        style={[styles.title, status === "pending" && styles.titlePending]}
        numberOfLines={1}
      >
        {title}
      </Animated.Text>
      <StatusIndicator status={status} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
  },
  rowGap: {
    marginBottom: 6,
  },
  leading: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AUTH_LOADING_COLORS.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: AUTH_LOADING_COLORS.title,
  },
  titlePending: {
    color: AUTH_LOADING_COLORS.subtitle,
    fontWeight: "500",
  },
  statusDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: AUTH_LOADING_COLORS.success,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPending: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: AUTH_LOADING_COLORS.pendingRing,
  },
  statusSpinner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  spinnerArc: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2.5,
    borderColor: AUTH_LOADING_COLORS.accent,
    borderTopColor: "transparent",
  },
});
