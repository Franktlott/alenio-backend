import { useEffect, useRef, useState } from "react";
import { Text, View, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { resolveUserImageUrl, userInitials } from "@/lib/user-avatar";

/**
 * A dropped request should not leave initials in place until the view happens
 * to be rebuilt, so a failed load is retried a few times with a widening gap.
 */
const MAX_AVATAR_RETRIES = 3;
const AVATAR_RETRY_DELAY_MS = 1200;

type Props = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    isWorkplaceConnected?: boolean;
    activeNow?: boolean;
  };
  size?: number;
  radius?: number;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
  textStyle?: TextStyle;
  testID?: string;
  /** Overrides the derived value on user for known workspace-member contexts. */
  workplaceConnected?: boolean;
  /** Profile-sized appearances can explain the badge when pressed. */
  workplaceConnectedInteractive?: boolean;
  /** Hide the avatar dot when a nearby status label already shows presence. */
  showOnlineIndicator?: boolean;
  /** FlatList recycling can reuse this view; change with the row id so a prior load error does not stick. */
  resetKey?: string | number | null;
};

export function UserAvatar({
  user,
  size = 40,
  radius,
  backgroundColor = "#F1F5F9",
  textColor = "#334155",
  fontSize,
  style,
  imageStyle,
  textStyle,
  testID,
  showOnlineIndicator = true,
  resetKey,
}: Props) {
  const uri = resolveUserImageUrl(user.image);
  const [gaveUp, setGaveUp] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const corner = radius ?? Math.round(size * 0.35);
  const labelSize = fontSize ?? Math.max(11, Math.round(size * 0.38));
  const showImage = !!uri && !gaveUp;
  const showOnline = showOnlineIndicator && user.activeNow === true;

  useEffect(() => {
    setGaveUp(false);
    setAttempt(0);
  }, [uri, resetKey]);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  return (
    <View
      testID={testID}
      style={[
        {
          width: size,
          height: size,
          position: "relative",
          overflow: "visible",
          flexShrink: 0,
        },
      ]}
    >
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: corner,
            backgroundColor,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          },
          style,
        ]}
      >
        {/* Initials sit underneath rather than instead of the photo. A load
            that fails after the image was already on screen then reveals them
            instead of an empty coloured circle. */}
        <Text style={[{ color: textColor, fontWeight: "700", fontSize: labelSize }, textStyle]}>
          {userInitials(user)}
        </Text>
        {showImage ? (
          <Image
            testID={testID ? `${testID}-image` : undefined}
            source={{ uri: uri! }}
            style={[
              { position: "absolute", top: 0, left: 0, width: size, height: size },
              imageStyle,
            ]}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={`${resetKey ?? ""}:${attempt}:${uri}`}
            onError={() => {
              if (!uri) return;
              // Every failure retries, including one on a photo that loaded a
              // moment ago: an evicted cache entry is exactly the case that
              // used to blank the circle and never recover.
              if (attempt >= MAX_AVATAR_RETRIES) {
                setGaveUp(true);
                return;
              }
              if (retryTimer.current) clearTimeout(retryTimer.current);
              retryTimer.current = setTimeout(
                () => setAttempt((count) => count + 1),
                AVATAR_RETRY_DELAY_MS * (attempt + 1),
              );
            }}
          />
        ) : null}
      </View>
      {showOnline ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Active now"
          testID={testID ? `${testID}-online` : undefined}
          style={{
            position: "absolute",
            zIndex: 4,
            right: -1,
            bottom: -1,
            width: Math.max(10, Math.min(14, Math.round(size * 0.28))),
            height: Math.max(10, Math.min(14, Math.round(size * 0.28))),
            borderRadius: 999,
            borderWidth: 2,
            borderColor: "#FFFFFF",
            backgroundColor: "#22C55E",
          }}
        />
      ) : null}
    </View>
  );
}
