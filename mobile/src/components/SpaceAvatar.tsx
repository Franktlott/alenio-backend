import { useEffect, useState } from "react";
import { Image, Text, View, type ViewStyle } from "react-native";
import { Hash } from "lucide-react-native";
import { resolveUserImageUrl } from "@/lib/user-avatar";

type Props = {
  name: string;
  image?: string | null;
  color?: string | null;
  size?: number;
  radius?: number;
  style?: ViewStyle;
};

export function SpaceAvatar({ name, image, color, size = 40, radius, style }: Props) {
  const uri = resolveUserImageUrl(image);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const corner = radius ?? 12;
  const tint = color || "#4361EE";
  const firstLetter = name[0]?.toUpperCase() ?? "#";
  const isHash = /^[^a-zA-Z]/.test(name);
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
          backgroundColor: `${tint}22`,
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
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setFailedUri(uri)}
        />
      ) : isHash ? (
        <Hash size={Math.round(size * 0.42)} color={tint} />
      ) : (
        <Text style={{ fontSize: Math.round(size * 0.38), fontWeight: "700", color: tint }}>{firstLetter}</Text>
      )}
    </View>
  );
}
