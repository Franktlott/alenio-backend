import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { type LucideIcon } from "lucide-react-native";

/** Quiet mark for a blank Goals or Check-ins page. The icon says which one. */
export function DevelopmentEmptyMark({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={styles.markHalo}>
      <View style={styles.markTile}>
        <Icon size={26} color="#4361EE" strokeWidth={2.1} />
      </View>
    </View>
  );
}

/**
 * Shared empty state for the Development pane so the Goals and Check-ins
 * sections read with identical type, spacing, and voice.
 */
export function DevelopmentEmptyState({
  icon: Icon,
  title,
  body,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  testID?: string;
}) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.halo}>
        <View style={styles.iconTile}>
          <Icon size={19} color="#6D4AFF" strokeWidth={2.2} />
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  markHalo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F1FF",
  },
  markTile: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4DFF8",
  },
  wrap: { paddingVertical: 12, paddingHorizontal: 12, alignItems: "center" },
  halo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F1FF",
  },
  iconTile: {
    width: 33,
    height: 33,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E6E1FF",
    backgroundColor: "#FFFFFF",
  },
  title: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#0F172A",
    textAlign: "center",
  },
  body: {
    marginTop: 3,
    maxWidth: 250,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#6B7688",
    textAlign: "center",
  },
});
