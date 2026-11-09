import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { UserAvatar } from "@/components/UserAvatar";
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
  const destination = audience === "network" ? "network" : "workspace";
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
          backgroundColor="#EEF2FF"
          textColor="#4361EE"
          fontSize={14}
          workplaceConnected={false}
        />
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Share an update with your ${destination}`}
          testID={rowTestID}
          style={styles.field}
        >
          <Text style={styles.placeholder} numberOfLines={1}>
            Share an update with your {destination}…
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: FEED_CARD_PADDING,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DFE5EE",
    backgroundColor: "#FFFFFF",
    shadowColor: "#172554",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
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
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 11,
    backgroundColor: "#F7F8FB",
  },
  placeholder: {
    fontSize: 13,
    color: "#7B8798",
  },
});
