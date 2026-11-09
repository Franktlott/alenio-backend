import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import {
  normalizeImageMime,
  normalizePickedFilename,
  requiresJpegTranscode,
} from "./file-picker-normalization";

export {
  extensionForMimeType,
  normalizeImageMime,
  normalizePickedFilename,
  requiresJpegTranscode,
} from "./file-picker-normalization";

export type PickedFile = {
  uri: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
};

export async function pickImage(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Photo library access is required. Enable it in your device Settings.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'] as ImagePicker.MediaType[],
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  return toPickedFile(asset);
}

function toPickedFile(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const mimeType = normalizeImageMime(asset.mimeType);
  return {
    uri: asset.uri,
    filename: normalizePickedFilename(asset.fileName, mimeType, "photo"),
    mimeType,
    sizeBytes: asset.fileSize,
  };
}

async function toAttachmentPickedFile(
  asset: ImagePicker.ImagePickerAsset,
): Promise<PickedFile> {
  if (!requiresJpegTranscode(asset.mimeType, asset.fileName)) {
    return toPickedFile(asset);
  }
  const converted = await ImageManipulator.manipulateAsync(asset.uri, [], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return {
    uri: converted.uri,
    filename: normalizePickedFilename(asset.fileName, "image/jpeg", "photo"),
    mimeType: "image/jpeg",
    sizeBytes: undefined,
  };
}

export async function pickAttachmentImage(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Photo library access is required. Enable it in your device Settings.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"] as ImagePicker.MediaType[],
    quality: 0.9,
    allowsEditing: false,
  });
  if (result.canceled) return null;
  return toAttachmentPickedFile(result.assets[0]);
}

export async function takePhoto(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Camera access is required. Enable it in your device Settings.");
  }

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (result.canceled) return null;
  return toPickedFile(result.assets[0]);
}

export async function takeAttachmentPhoto(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Camera access is required. Enable it in your device Settings.");
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.9,
    allowsEditing: false,
  });
  if (result.canceled) return null;
  return toAttachmentPickedFile(result.assets[0]);
}

export async function pickMedia(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
    quality: 0.8,
    // iOS otherwise fails with PHPhotosErrorDomain 3164 when a selected
    // video is optimized in iCloud and is not already stored on-device.
    allowsEditing: Platform.OS === "ios",
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const isVideo = asset.type === 'video';
  return {
    uri: asset.uri,
    filename: asset.fileName ?? `media-${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
    mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
    sizeBytes: asset.fileSize,
  };
}

export async function pickPdf(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    filename: normalizePickedFilename(asset.name, "application/pdf", "document"),
    mimeType: "application/pdf",
    sizeBytes: asset.size,
  };
}
