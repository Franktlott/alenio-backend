import { useEffect, useState } from "react";
import { Text, View, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { resolveUserImageUrl, userInitials } from "@/lib/user-avatar";

/** Once a URL loads successfully anywhere, keep using it even if a later cell briefly errors. */
const loadedAvatarUris = new Set<string>();

type Props = {
  user: { name?: string | null; email?: string | null; image?: string | null };
  size?: number;
  radius?: number;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
  textStyle?: TextStyle;
  testID?: string;
  /** FlatList recycling can reuse this view; change with the row id so a prior load error does not stick. */
  resetKey?: string | number | null;
};

export function UserAvatar({
  user,
  size = 40,
  radius,
  backgroundColor = "#4361EE",
  textColor = "#FFFFFF",
  fontSize,
  style,
  imageStyle,
  textStyle,
  testID,
  resetKey,
}: Props) {
  const uri = resolveUserImageUrl(user.image);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const corner = radius ?? Math.round(size * 0.35);
  const labelSize = fontSize ?? Math.max(11, Math.round(size * 0.38));
  const knownGood = !!uri && loadedAvatarUris.has(uri);
  const showImage = !!uri && (knownGood || failedUri !== uri);

  useEffect(() => {
    setFailedUri(null);
  }, [uri, resetKey]);

  return (
    <View
      testID={testID}
      style={[
        {
          width: size,
          height: size,
          borderRadius: corner,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          testID={testID ? `${testID}-image` : undefined}
          source={{ uri: uri! }}
          style={[{ width: size, height: size }, imageStyle]}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`${resetKey ?? ""}:${uri}`}
          onLoad={() => {
            if (uri) loadedAvatarUris.add(uri);
            if (failedUri === uri) setFailedUri(null);
          }}
          onError={() => {
            if (!uri || loadedAvatarUris.has(uri)) return;
            setFailedUri(uri);
          }}
        />
      ) : (
        <Text style={[{ color: textColor, fontWeight: "700", fontSize: labelSize }, textStyle]}>
          {userInitials(user)}
        </Text>
      )}
    </View>
  );
}
