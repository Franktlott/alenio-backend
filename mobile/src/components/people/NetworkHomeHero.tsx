import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Compass } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { AcceptedConnectionEntry } from "@/lib/types";
import { palette } from "@/theme";

const AVATAR_STACK = 3;

type Props = {
  connectionCount: number;
  newThisMonth: number;
  preview: AcceptedConnectionEntry[];
  compact?: boolean;
  /** Match the page / Feed pill gutter so title clears the bezel. */
  contentPadLeft?: number;
  contentPadRight?: number;
  onDiscover?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * My Network hero: faces / count summary + Discover on the purple band.
 */
export function NetworkHomeHero({
  connectionCount,
  newThisMonth,
  preview,
  compact = false,
  contentPadLeft = 20,
  contentPadRight = 20,
  onDiscover,
  onLayout,
}: Props) {
  const faces = preview.slice(0, AVATAR_STACK);
  const overflow = Math.max(0, connectionCount - faces.length);
  const avatarSize = compact ? 28 : 32;
  const avatarRadius = avatarSize / 2;
  const overlap = compact ? -9 : -10;
  const monthLabel =
    newThisMonth > 0 ? `+${newThisMonth} this month` : "0 this month";
  const overflowLabel = overflow > 99 ? "99+" : `+${overflow}`;

  const faceStack =
    faces.length > 0 ? (
      <View style={styles.faceStack}>
        {faces.map((entry, index) => (
          <View
            key={entry.person.id}
            style={[
              styles.face,
              index > 0 ? { marginLeft: overlap } : null,
              { zIndex: faces.length - index },
            ]}
          >
            <UserAvatar
              user={{
                name: entry.person.name,
                image: entry.person.image,
                activeNow: entry.activeNow,
              }}
              size={avatarSize}
              radius={avatarRadius}
              backgroundColor="#EEF2FF"
              textColor="#334155"
              fontSize={compact ? 11 : 12}
            />
          </View>
        ))}
        {overflow > 0 ? (
          <View
            style={[
              styles.face,
              styles.overflowFace,
              {
                marginLeft: overlap,
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarRadius,
                zIndex: 0,
              },
            ]}
            accessibilityLabel={`${overflow} more connections`}
          >
            <Text
              style={[
                styles.overflowLabel,
                { fontSize: compact ? 10 : 11 },
              ]}
              numberOfLines={1}
            >
              {overflowLabel}
            </Text>
          </View>
        ) : null}
      </View>
    ) : null;

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.wrap,
        compact ? styles.wrapCompact : null,
        { paddingLeft: contentPadLeft, paddingRight: contentPadRight },
      ]}
      testID="network-home-hero"
    >
      <View style={styles.stack}>
        <View style={styles.metaRow} testID="network-home-hero-stats">
          <View style={styles.metaLeft}>
            {faceStack}
            <View style={styles.metaCopy}>
              <Text style={styles.metaCount}>
                {connectionCount}{" "}
                {connectionCount === 1 ? "connection" : "connections"}
              </Text>
              <Text style={styles.metaMonth}>{monthLabel}</Text>
            </View>
          </View>
          {onDiscover ? (
            <Pressable
              onPress={onDiscover}
              accessibilityRole="button"
              accessibilityLabel="Discover people"
              hitSlop={8}
              style={({ pressed }) => [
                styles.discoverHit,
                pressed ? styles.discoverHitPressed : null,
              ]}
              testID="network-home-hero-discover"
            >
              <View style={styles.discoverBtn}>
                <Compass size={13} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.discoverLabel}>Discover</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "transparent",
    paddingTop: 2,
    paddingBottom: 14,
  },
  wrapCompact: {
    paddingBottom: 12,
  },
  stack: {
    gap: 0,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  metaLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  faceStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  face: {
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: palette.dusk,
  },
  overflowFace: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderColor: "rgba(255,255,255,0.95)",
  },
  overflowLabel: {
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#FFFFFF",
  },
  metaCopy: {
    flexShrink: 1,
    gap: 1,
  },
  metaCount: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: -0.15,
    color: "#FFFFFF",
  },
  metaMonth: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "rgba(226, 214, 255, 0.88)",
  },
  discoverHit: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "center",
  },
  discoverHitPressed: {
    opacity: 0.72,
  },
  discoverBtn: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "center",
    height: 30,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.30)",
  },
  discoverLabel: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: -0.1,
    color: "#FFFFFF",
  },
});
