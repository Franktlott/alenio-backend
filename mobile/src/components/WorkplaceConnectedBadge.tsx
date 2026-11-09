import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { Check } from "lucide-react-native";
import { AlenioBottomSheet, AlenioSheetCard } from "@/components/AlenioBottomSheet";

export const WORKPLACE_CONNECTED_MIN_AVATAR_SIZE = 36;

type Props = {
  avatarSize: number;
  firstName?: string | null;
  interactive?: boolean;
  testID?: string;
};

export function WorkplaceConnectedBadge({
  avatarSize,
  firstName,
  interactive = false,
  testID,
}: Props) {
  const [showInfo, setShowInfo] = useState(false);

  if (avatarSize < WORKPLACE_CONNECTED_MIN_AVATAR_SIZE) return null;

  const size = Math.max(14, Math.min(22, Math.round(avatarSize * 0.31)));
  const badgeStyle = [
    styles.badge,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: Math.max(1.5, Math.round(size * 0.1)),
      right: -Math.round(size * 0.16),
      bottom: -Math.round(size * 0.08),
    },
  ];
  const label = "Workplace Connected";

  const badge = interactive ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Shows what the Workplace Connected badge means"
      hitSlop={8}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        setShowInfo(true);
      }}
      style={badgeStyle}
    >
      <Check size={Math.round(size * 0.58)} color="#FFFFFF" strokeWidth={3.2} />
    </Pressable>
  ) : (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={badgeStyle}
    >
      <Check size={Math.round(size * 0.58)} color="#FFFFFF" strokeWidth={3.2} />
    </View>
  );

  return (
    <>
      {badge}
      {interactive ? (
        <AlenioBottomSheet
          visible={showInfo}
          title="Workplace Connected"
          subtitle="Active workspace participation on Alenio"
          onClose={() => setShowInfo(false)}
          compact
          showCloseButton
          scrollEnabled={false}
          testID="workplace-connected-info-sheet"
        >
          <AlenioSheetCard tint="blue" compact>
            <Text style={styles.infoText}>
              {firstName?.trim() || "This person"} is currently connected to a workspace on Alenio.
            </Text>
          </AlenioSheetCard>
          <Text style={styles.disclaimer}>
            This badge indicates active workspace participation. It does not mean that Alenio has
            verified or endorsed the organization represented by the workspace.
          </Text>
        </AlenioBottomSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    zIndex: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    borderColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  infoText: {
    color: "#1E293B",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  disclaimer: {
    marginTop: 14,
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
  },
});
