import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { MoreHorizontal } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { elevation } from "@/theme";

export const FEED_AVATAR = 36;
export const FEED_ACCENT = "#6d28d9";
export const WORKSPACE_FEED_HORIZONTAL_INSET = 16;
export const WORKSPACE_FEED_MAX_WIDTH = 680;
export const WORKSPACE_FEED_GAP = 8;
export const WORKSPACE_FEED_SECTION_GAP = 12;
export const FEED_CARD_PADDING = 12;
export const FEED_CARD_WIDE_PADDING = 14;
export const FEED_WIDE_PADDING_BREAKPOINT = 430;
const PAIRED_AVATAR = 18;

type Props = {
  /** Author photo; falls back to initials when there is no image. */
  avatar?: { name: string; image?: string | null } | null;
  /** Second face, tucked under the first — recognition involves two people. */
  pairedAvatar?: { name: string; image?: string | null } | null;
  /** Identity line — rich text so variants can mix weights. */
  identity: ReactNode;
  /** Timestamp / role line under the identity. */
  meta?: string | null;
  onMore?: () => void;
  /** Tapping the body opens the post's thread. */
  onPress?: () => void;
  onLongPress?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** Decorative layer behind the interactive card content. */
  backgroundDecoration?: ReactNode;
  avatarResetKey?: string;
  testID?: string;
  /** Automated activity uses less vertical padding than authored posts. */
  compact?: boolean;
};

/** Shared chrome for every Updates feed item: white card, one header row, body, action row. */
export function WorkspaceFeedCardShell({
  avatar,
  pairedAvatar,
  identity,
  meta,
  onMore,
  onPress,
  onLongPress,
  children,
  footer,
  backgroundDecoration,
  avatarResetKey,
  testID,
  compact = false,
}: Props) {
  const { width } = useWindowDimensions();
  const cardPadding =
    width >= FEED_WIDE_PADDING_BREAKPOINT
      ? FEED_CARD_WIDE_PADDING
      : FEED_CARD_PADDING;

  return (
    <View style={styles.card}>
      {backgroundDecoration}
      {/* css-interop drops function-form style props, so keep these plain. */}
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={280}
        disabled={!onPress && !onLongPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityHint={onPress ? "Opens comments" : undefined}
        testID={testID}
        style={[
          styles.inner,
          {
            paddingHorizontal: cardPadding,
            paddingVertical: compact ? 10 : cardPadding,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={pairedAvatar ? styles.avatarPair : undefined}>
            <UserAvatar
              user={avatar ?? { name: "Someone" }}
              size={FEED_AVATAR}
              radius={FEED_AVATAR / 2}
              backgroundColor="#EFE9FF"
              textColor={FEED_ACCENT}
              fontSize={14}
              resetKey={avatarResetKey}
              workplaceConnected={false}
            />
            {pairedAvatar ? (
              <View style={styles.pairedAvatar}>
                <UserAvatar
                  user={pairedAvatar}
                  size={PAIRED_AVATAR}
                  radius={PAIRED_AVATAR / 2}
                  backgroundColor="#E4E9F7"
                  textColor={FEED_ACCENT}
                  fontSize={9}
                  resetKey={avatarResetKey}
                  workplaceConnected={false}
                />
              </View>
            ) : null}
          </View>
          <View style={styles.headerCopy}>
            {identity}
            {meta ? (
              <Text style={styles.meta} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          {onMore ? (
            <Pressable
              onPress={onMore}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Update options"
              testID={testID ? `${testID}-more` : undefined}
              style={styles.moreBtn}
            >
              <MoreHorizontal size={19} color="#718096" strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>

        {children}
        {footer}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...elevation.card,
    borderRadius: 18,
  },
  inner: {
    padding: FEED_CARD_PADDING,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  avatarPair: {
    // Room for the second face to sit past the first without clipping.
    width: FEED_AVATAR + 6,
    height: FEED_AVATAR,
  },
  pairedAvatar: {
    position: "absolute",
    right: 0,
    bottom: -2,
    borderRadius: PAIRED_AVATAR / 2 + 2,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
  },
  meta: {
    marginTop: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "500",
    color: "#93A0B4",
  },
  moreBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
});
