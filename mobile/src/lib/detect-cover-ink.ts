import { Image, Platform, type ImageSourcePropType } from "react-native";
import { getColors, type ImageColorsResult } from "react-native-image-colors";
import { inkForBackground, type CoverInk } from "./cover-contrast";

export function resolveCoverUri(source: ImageSourcePropType): string | null {
  if (typeof source === "number") {
    return Image.resolveAssetSource(source)?.uri ?? null;
  }
  if (Array.isArray(source)) {
    for (const entry of source) {
      const uri = resolveCoverUri(entry);
      if (uri) return uri;
    }
    return null;
  }
  if (source && typeof source === "object" && "uri" in source && source.uri) {
    return source.uri;
  }
  return null;
}

function sampleHex(result: ImageColorsResult): string {
  if (result.platform === "android") {
    return result.average || result.dominant || result.muted || "#1A0B3A";
  }
  if (result.platform === "ios") {
    return result.background || result.primary || result.detail || "#1A0B3A";
  }
  return result.dominant || result.muted || "#1A0B3A";
}

/** Samples a cover image and returns whether overlay copy should be light or dark. */
export async function detectCoverInk(
  source: ImageSourcePropType,
  cacheKey?: string,
): Promise<CoverInk> {
  const uri = resolveCoverUri(source);
  if (!uri) return "light";
  try {
    const colors = await getColors(uri, {
      fallback: "#1A0B3A",
      cache: true,
      key: cacheKey ?? uri,
      ...(Platform.OS === "ios" || Platform.OS === "web"
        ? { quality: "low" as const }
        : {}),
    });
    return inkForBackground(sampleHex(colors));
  } catch {
    return "light";
  }
}
