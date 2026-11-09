import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import { SpotlightIllustration } from "@/components/workspace/SpotlightIllustration";
import type { ResolvedSpotlight, SpotlightCta } from "@/lib/workspace-spotlight";

const FADE_MS = 250;
const RAIL_HEIGHT = 360;
const COMPACT_HEIGHT = 196;

type Props = {
  spotlight: ResolvedSpotlight | null;
  variant: "rail" | "compact";
  onSayHello: (memberName: string) => void;
  onCelebrate: () => void;
  onShare: () => void;
  onDismiss: () => void;
};

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduce(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

function ctaLabel(cta: SpotlightCta): string {
  if (cta === "say_hello") return "Say hello";
  if (cta === "celebrate") return "Celebrate";
  return "Share an update";
}

function SpotlightContent({
  spotlight,
  variant,
  reduceMotion,
  onSayHello,
  onCelebrate,
  onShare,
  onDismiss,
}: {
  spotlight: ResolvedSpotlight;
  variant: "rail" | "compact";
  reduceMotion: boolean;
  onSayHello: (memberName: string) => void;
  onCelebrate: () => void;
  onShare: () => void;
  onDismiss: () => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const shownOnce = useRef(false);
  const compact = variant === "compact";

  useEffect(() => {
    if (!shownOnce.current) {
      shownOnce.current = true;
      opacity.setValue(1);
      return;
    }
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [opacity, reduceMotion, spotlight.eventId, spotlight.kind]);

  const onCta = () => {
    if (spotlight.cta === "say_hello") {
      onSayHello(spotlight.memberName ?? "there");
      return;
    }
    if (spotlight.cta === "celebrate") onCelebrate();
    if (spotlight.cta === "share") onShare();
  };

  return (
    <Animated.View
      style={[
        compact ? styles.compactBody : styles.railBody,
        { opacity },
      ]}
    >
      <SpotlightIllustration kind={spotlight.kind} wide={!compact} />
      <View style={compact ? styles.compactCopy : styles.railCopy}>
        <Text
          style={compact ? styles.compactHeadline : styles.headline}
          numberOfLines={2}
        >
          {spotlight.headline}
        </Text>
        <Text
          style={compact ? styles.compactDescription : styles.description}
          numberOfLines={compact ? 2 : 3}
        >
          {spotlight.description}
        </Text>
        {spotlight.cta ? (
          <Pressable
            onPress={onCta}
            style={[styles.cta, compact ? null : styles.ctaCentered]}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel(spotlight.cta)}
            testID="workspace-spotlight-cta"
          >
            <Text style={styles.ctaText}>{ctaLabel(spotlight.cta)}</Text>
          </Pressable>
        ) : null}
      </View>
      {spotlight.eventId ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss spotlight"
          testID="workspace-spotlight-dismiss"
        >
          <X size={14} color="#94A3B8" strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

export function WorkspaceSpotlight({
  spotlight,
  variant,
  onSayHello,
  onCelebrate,
  onShare,
  onDismiss,
}: Props) {
  const reduceMotion = usePrefersReducedMotion();
  const compact = variant === "compact";

  return (
    <View
      style={[styles.card, { height: compact ? COMPACT_HEIGHT : RAIL_HEIGHT }]}
      testID={
        spotlight
          ? `workspace-spotlight-${spotlight.kind}`
          : "workspace-spotlight-loading"
      }
      accessibilityRole="summary"
      accessibilityLabel={
        spotlight
          ? `${spotlight.headline}. ${spotlight.description}`
          : "Workspace spotlight"
      }
    >
      {spotlight ? (
        <SpotlightContent
          spotlight={spotlight}
          variant={variant}
          reduceMotion={reduceMotion}
          onSayHello={onSayHello}
          onCelebrate={onCelebrate}
          onShare={onShare}
          onDismiss={onDismiss}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  railBody: {
    flex: 1,
    alignItems: "stretch",
  },
  railCopy: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  compactBody: {
    flex: 1,
    alignItems: "stretch",
  },
  compactCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingRight: 28,
    paddingBottom: 10,
  },
  headline: {
    marginTop: 2,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    color: "#172033",
    textAlign: "center",
  },
  description: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "500",
    color: "#667085",
    textAlign: "center",
  },
  compactHeadline: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#172033",
  },
  compactDescription: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: "#667085",
  },
  ctaCentered: {
    alignSelf: "center",
  },
  cta: {
    alignSelf: "flex-start",
    marginTop: 8,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  ctaText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#4361EE",
  },
  dismiss: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
