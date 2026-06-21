import { useEffect, useState } from "react";
import { Image, Text, View, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import { resolveUserImageUrl, userInitials } from "@/lib/user-avatar";

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
}: Props) {
  const uri = resolveUserImageUrl(user.image);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const corner = radius ?? Math.round(size * 0.35);
  const labelSize = fontSize ?? Math.max(11, Math.round(size * 0.38));
  const showImage = !!uri && failedUri !== uri;

  useEffect(() => {
    setFailedUri(null);
  }, [uri]);

  return (
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
          flexShrink: 0,
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          style={[{ width: size, height: size }, imageStyle]}
          resizeMode="cover"
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <Text style={[{ color: textColor, fontWeight: "700", fontSize: labelSize }, textStyle]}>
          {userInitials(user)}
        </Text>
      )}
    </View>
  );
}
