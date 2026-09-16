import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MoreVertical } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";

export const FEED_AVATAR = 36;
export const FEED_ACCENT = "#4361EE";
const PAIRED_AVATAR = 20;

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
  avatarResetKey?: string;
  testID?: string;
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
  avatarResetKey,
  testID,
}: Props) {
  return (
    <View style={styles.card}>
      {/* css-interop drops function-form style props, so keep these plain. */}
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={280}
        disabled={!onPress && !onLongPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityHint={onPress ? "Opens comments" : undefined}
        testID={testID}
        style={styles.inner}
      >
        <View style={styles.header}>
          <View style={pairedAvatar ? styles.avatarPair : undefined}>
            <UserAvatar
              user={avatar ?? { name: "Someone" }}
              size={FEED_AVATAR}
              radius={FEED_AVATAR / 2}
              backgroundColor="#EEF2FF"
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
              <MoreVertical size={17} color="#A7B0C0" strokeWidth={2.2} />
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
    backgroundColor: "#FFFFFF",
    // Full-bleed white band; the gray edge is the break between posts.
    borderBottomWidth: 6,
    borderBottomColor: "#F0F3F8",
  },
  inner: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
    width: 26,
    minHeight: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -4,
    alignSelf: "flex-start",
  },
});
