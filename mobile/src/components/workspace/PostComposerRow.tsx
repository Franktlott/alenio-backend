import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { elevation } from "@/theme";
import {
  FEED_CARD_PADDING,
  FEED_CARD_WIDE_PADDING,
  FEED_WIDE_PADDING_BREAKPOINT,
} from "@/components/workspace/WorkspaceFeedCardShell";

type Props = {
  author: { name: string; image?: string | null };
  onPress: () => void;
  audience?: "workspace" | "network";
};

/** The "what's on your mind" row that opens the composer. */
export function PostComposerRow({
  author,
  onPress,
  audience = "workspace",
}: Props) {
  const { width } = useWindowDimensions();
  const cardPadding =
    width >= FEED_WIDE_PADDING_BREAKPOINT
      ? FEED_CARD_WIDE_PADDING
      : FEED_CARD_PADDING;
  const rowTestID =
    audience === "network"
      ? "network-updates-compose"
      : "workspace-post-composer-row";

  return (
    <View style={[styles.card, { padding: cardPadding }]}>
      <View style={styles.row}>
        <UserAvatar
          user={author}
          size={36}
          radius={18}
          backgroundColor="#EFE9FF"
          textColor="#6d28d9"
          fontSize={14}
          workplaceConnected={false}
        />
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Share an update"
          testID={rowTestID}
          style={styles.field}
        >
          <Text style={styles.placeholder} numberOfLines={1}>
            Share an update…
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: FEED_CARD_PADDING,
    ...elevation.card,
    borderRadius: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  field: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    height: 36,
    borderRadius: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "#FFFFFF",
  },
  placeholder: {
    fontSize: 13,
    color: "#8A96A8",
  },
});
