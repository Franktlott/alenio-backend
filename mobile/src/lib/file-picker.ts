import * as ImagePicker from "expo-image-picker";

export type PickedFile = { uri: string; filename: string; mimeType: string };

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

function normalizeImageMime(mime?: string | null): string {
  if (!mime) return "image/jpeg";
  if (mime === "image/heic" || mime === "image/heif") return "image/jpeg";
  return mime;
}

function toPickedFile(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const mimeType = normalizeImageMime(asset.mimeType);
  const ext = mimeType.includes("png") ? "png" : "jpg";
  return {
    uri: asset.uri,
    filename: asset.fileName ?? `photo-${Date.now()}.${ext}`,
    mimeType,
  };
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

export async function pickMedia(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const isVideo = asset.type === 'video';
  return {
    uri: asset.uri,
    filename: asset.fileName ?? `media-${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
    mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
  };
}
