import { Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  normalizeImageMime,
  normalizePickedFilename,
  requiresJpegTranscode,
  type PickedFile,
} from "@/lib/file-picker";

/**
 * Overview hero card shape (width ÷ height). Matches WorkspaceOverviewCard.
 * Wider than 16:9 so the short banner fills without letterboxing.
 */
export const WORKSPACE_COVER_ASPECT = 2.75;

/** Integer pair for the system crop UI (~2.75:1). */
export const WORKSPACE_COVER_PICKER_ASPECT: [number, number] = [11, 4];

const COVER_MAX_WIDTH = 2400;
const ASPECT_TOLERANCE = 0.04;

function readImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error ?? new Error("Could not read that photo.")),
    );
  });
}

function matchesCoverAspect(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const aspect = width / height;
  return (
    Math.abs(aspect - WORKSPACE_COVER_ASPECT) / WORKSPACE_COVER_ASPECT <=
    ASPECT_TOLERANCE
  );
}

/** Center crop to the overview card ratio when the photo is larger / mismatched. */
function centerCoverCrop(
  width: number,
  height: number,
): ImageManipulator.Action {
  const imageAspect = width / height;
  if (imageAspect > WORKSPACE_COVER_ASPECT) {
    const cropWidth = Math.max(1, Math.round(height * WORKSPACE_COVER_ASPECT));
    return {
      crop: {
        originX: Math.max(0, Math.round((width - cropWidth) / 2)),
        originY: 0,
        width: Math.min(width, cropWidth),
        height,
      },
    };
  }
  const cropHeight = Math.max(1, Math.round(width / WORKSPACE_COVER_ASPECT));
  return {
    crop: {
      originX: 0,
      originY: Math.max(0, Math.round((height - cropHeight) / 2)),
      width,
      height: Math.min(height, cropHeight),
    },
  };
}

/**
 * Pick a cover for the Workspace overview card. Opens the crop UI at the card
 * ratio, then center-crops and downsizes if the result is still too big or off-shape.
 */
export async function pickWorkspaceCoverPhoto(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(
      "Photo library access is required. Enable it in your device Settings.",
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"] as ImagePicker.MediaType[],
    quality: 1,
    allowsEditing: true,
    aspect: WORKSPACE_COVER_PICKER_ASPECT,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  let uri = asset.uri;
  let mimeType = normalizeImageMime(asset.mimeType);
  let filename = normalizePickedFilename(asset.fileName, mimeType, "cover");

  if (requiresJpegTranscode(asset.mimeType, asset.fileName)) {
    const converted = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    uri = converted.uri;
    mimeType = "image/jpeg";
    filename = normalizePickedFilename(asset.fileName, mimeType, "cover");
  }

  const size =
    asset.width > 0 && asset.height > 0
      ? { width: asset.width, height: asset.height }
      : await readImageSize(uri);

  const actions: ImageManipulator.Action[] = [];
  if (!matchesCoverAspect(size.width, size.height)) {
    actions.push(centerCoverCrop(size.width, size.height));
  }

  let nextWidth = size.width;
  if (!matchesCoverAspect(size.width, size.height)) {
    const crop = (actions[0] as { crop: { width: number } }).crop;
    nextWidth = crop.width;
  }
  if (nextWidth > COVER_MAX_WIDTH) {
    actions.push({ resize: { width: COVER_MAX_WIDTH } });
  }

  if (actions.length === 0) {
    return { uri, filename, mimeType };
  }

  const cropped = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    uri: cropped.uri,
    filename: `workspace-cover-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
  };
}
