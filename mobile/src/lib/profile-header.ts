import { Image, type ImageSourcePropType } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { api } from "@/lib/api/api";
import {
  normalizeImageMime,
  normalizePickedFilename,
  requiresJpegTranscode,
} from "@/lib/file-picker";
import { uploadFile } from "@/lib/upload";
import {
  clampHeaderCrop,
  HEADER_CROP_MAX_WIDTH,
  type HeaderCropRect,
} from "@/lib/profile-header-frame";

export type HeaderPhotoPick = {
  uri: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
};

/** Phone / portrait banner — ~2.2:1 so small screens fill edge to edge. */
const DEFAULT_PROFILE_HEADER_PHONE = require("@/assets/alenio-profile-header-phone.jpg");
/** Wide / landscape banner — ~3:1 so large screens fill without letterboxing. */
const DEFAULT_PROFILE_HEADER_WIDE = require("@/assets/alenio-profile-header-wide.jpg");

export type ProfileHeaderSourceOptions = {
  /** Prefer the wide default mountain (tablets, two-column, landscape). */
  wide?: boolean;
};

/** Default mountain sized for the screen — no runtime resize gymnastics. */
export function profileDefaultHeaderSource(
  options?: ProfileHeaderSourceOptions,
): ImageSourcePropType {
  return options?.wide
    ? DEFAULT_PROFILE_HEADER_WIDE
    : DEFAULT_PROFILE_HEADER_PHONE;
}

/** Custom cover when one is saved, otherwise the sized default mountain. */
export function profileHeaderSource(
  url?: string | null,
  options?: ProfileHeaderSourceOptions,
): ImageSourcePropType {
  const trimmed = url?.trim();
  return trimmed ? { uri: trimmed } : profileDefaultHeaderSource(options);
}

/** Pick the full photo. Framing happens afterward when it is not already header-shaped. */
export async function pickHeaderPhoto(): Promise<HeaderPhotoPick | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Photo library access is required. Enable it in your device Settings.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"] as ImagePicker.MediaType[],
    quality: 1,
    allowsEditing: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const size =
    asset.width > 0 && asset.height > 0
      ? { width: asset.width, height: asset.height }
      : await readImageSize(asset.uri);
  const mimeType = normalizeImageMime(asset.mimeType);
  let uri = asset.uri;
  let filename = normalizePickedFilename(asset.fileName, mimeType, "header");
  let resolvedMime = mimeType;
  if (requiresJpegTranscode(asset.mimeType, asset.fileName)) {
    const converted = await ImageManipulator.manipulateAsync(asset.uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    uri = converted.uri;
    resolvedMime = "image/jpeg";
    filename = normalizePickedFilename(asset.fileName, resolvedMime, "header");
  }
  return {
    uri,
    filename,
    mimeType: resolvedMime,
    width: size.width,
    height: size.height,
  };
}

/** Cut the chosen window out of the photo and save it as a header-sized JPEG. */
export async function cropHeaderPhoto(
  photo: HeaderPhotoPick,
  crop: HeaderCropRect,
): Promise<HeaderPhotoPick> {
  const safe = clampHeaderCrop(crop, photo.width, photo.height);
  const actions: ImageManipulator.Action[] = [{ crop: safe }];
  if (safe.width > HEADER_CROP_MAX_WIDTH) {
    actions.push({ resize: { width: HEADER_CROP_MAX_WIDTH } });
  }
  const result = await ImageManipulator.manipulateAsync(photo.uri, actions, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const width =
    result.width > 0
      ? result.width
      : safe.width > HEADER_CROP_MAX_WIDTH
        ? HEADER_CROP_MAX_WIDTH
        : safe.width;
  const height =
    result.height > 0
      ? result.height
      : Math.max(1, Math.round(safe.height * (width / safe.width)));
  return {
    uri: result.uri,
    filename: `header-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
    width,
    height,
  };
}

export async function saveProfileHeaderFile(
  file: Pick<HeaderPhotoPick, "uri" | "filename" | "mimeType">,
): Promise<string> {
  const uploaded = await uploadFile(file.uri, file.filename, file.mimeType, {
    purpose: "generic",
  });
  await api.patch("/api/profile", { profileHeaderImage: uploaded.url });
  return uploaded.url;
}

function readImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error ?? new Error("Could not read that photo.")),
    );
  });
}

/** Restore the default mountain header. */
export async function clearProfileHeaderImage(): Promise<void> {
  await api.patch("/api/profile", { profileHeaderImage: null });
}
