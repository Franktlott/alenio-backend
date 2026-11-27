import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarCheck, Plus } from "lucide-react-native";
import { DevelopmentEmptyState } from "@/components/development/DevelopmentEmptyState";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";
import { colors } from "@/theme";

const CHECKIN_EMPTY_ART = require("@/assets/checkin-empty-develop.png");

export function CheckInEmptyState({
  memberName,
  isSelf = false,
  canCreate,
  compact,
  error,
  onStart,
}: {
  memberName: string;
  memberImage?: string | null;
  /** The signed-in person is the member these check-ins belong to. */
  isSelf?: boolean;
  canCreate: boolean;
  recordingSupported: boolean;
  /** Set where the list cannot scroll, such as beside a live video call. */
  compact: boolean;
  error?: string | null;
  onStart?: () => void;
}) {
  const firstName =
    memberName.trim().split(/\s+/)[0] || memberName || "this teammate";

  if (error) {
    return (
      <DevelopmentEmptyState
        icon={CalendarCheck}
        title="Could not load check-ins"
        body={error}
        testID="check-in-empty-state-error"
      />
    );
  }

  // Someone who cannot run a check-in only needs to know why the list is empty.
  if (!canCreate) {
    return (
      <DevelopmentEmptyState
        icon={CalendarCheck}
        title="No check-ins yet"
        body={
          isSelf
            ? "Your check-ins will appear here once a leader runs one."
            : `Check-ins with ${firstName} will appear here once a leader runs one.`
        }
        testID="check-in-empty-state"
      />
    );
  }

  if (compact) {
    return (
      <View style={styles.compactWrap} testID="check-in-empty-state">
        <Text style={styles.compactTitle}>No check-ins yet</Text>
        <Text style={styles.compactBody}>
          {isSelf
            ? "Talk it through. Seneca writes it up."
            : `Talk with ${firstName}. Seneca writes it up.`}
        </Text>
        {onStart ? (
          <Pressable
            onPress={onStart}
            style={styles.compactCta}
            accessibilityRole="button"
            accessibilityLabel="Start a check-in"
            testID="check-in-empty-state-start"
          >
            <Plus size={13} color="#FFFFFF" strokeWidth={2.8} />
            <Text style={styles.compactCtaText}>Start a check-in</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="check-in-empty-state">
      <View style={styles.heroCard}>
        <Image
          source={CHECKIN_EMPTY_ART}
          style={styles.heroArt}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        <View style={styles.copy}>
          <Text style={styles.heroTitle}>Growth starts with a conversation.</Text>
          <Text style={styles.heroBody}>
            Create meaningful check-ins, discuss progress and support ongoing
            development.
          </Text>
        </View>

        {onStart ? (
          <Pressable
            onPress={onStart}
            style={styles.cta}
            accessibilityRole="button"
            accessibilityLabel="Start a check-in"
            testID="check-in-empty-state-start"
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.7} />
            <Text style={styles.ctaText}>Start a check-in</Text>
          </Pressable>
        ) : null}

        <View style={styles.senecaRow}>
          <SenecaIcon size={28} />
          <Text style={styles.senecaLabel}>
            Powered by <Text style={styles.senecaBrand}>Seneca</Text>
          </Text>
        </View>
      </View>

      <View style={styles.historyBlock}>
        <Text style={styles.historyTitle}>Check-in History</Text>
        <View style={styles.historyEmpty}>
          <CalendarCheck size={18} color="#A5B0C2" strokeWidth={2.1} />
          <Text style={styles.historyEmptyText}>
            No check-ins yet. Your completed check-ins will appear here.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  heroCard: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 16,
    backgroundColor: "#F3F0FF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4DEFF",
    alignItems: "center",
    gap: 14,
  },
  heroArt: {
    width: 198,
    height: 198,
    marginBottom: 2,
    backgroundColor: "transparent",
  },
  copy: {
    alignItems: "center",
    gap: 6,
    maxWidth: 300,
  },
  heroTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#17142B",
    textAlign: "center",
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: "#6B7388",
    textAlign: "center",
  },
  cta: {
    alignSelf: "stretch",
    minHeight: 48,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.brand,
  },
  ctaText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  senecaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  senecaLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    color: "#667085",
  },
  senecaBrand: {
    fontWeight: "800",
    color: "#17142B",
  },
  historyBlock: {
    gap: 8,
  },
  historyTitle: {
    paddingHorizontal: 2,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#172033",
  },
  historyEmpty: {
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#D7DCE5",
    backgroundColor: "#FAFBFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 8,
  },
  historyEmptyText: {
    maxWidth: 240,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#8A96A8",
    textAlign: "center",
  },
  compactWrap: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    alignItems: "center",
  },
  compactTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  compactBody: {
    maxWidth: 280,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#1F2739",
    textAlign: "center",
  },
  compactCta: {
    alignSelf: "center",
    height: 32,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
  compactCtaText: {
    fontSize: 12.5,
    lineHeight: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
