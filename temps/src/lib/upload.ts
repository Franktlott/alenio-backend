import * as FileSystem from "expo-file-system/legacy";
import { getBackendUrl } from "./backend-url";
import { getAccessToken } from "./session";
import { ApiError } from "./api";

type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
};

function asciiFilename(name: string): string {
  const trimmed = name.trim() || "photo.jpg";
  const safe = trimmed.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  return safe.length > 0 ? safe : "photo.jpg";
}

async function ensureUploadableUri(uri: string): Promise<string> {
  if (uri.startsWith("file://")) return uri;
  const ext = uri.toLowerCase().includes(".png") ? "png" : "jpg";
  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheDir) return uri;
  const dest = `${cacheDir}temps-upload-${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

/** Upload a local photo via JSON + base64 (same path as Alenio mobile). */
export async function uploadLocalPhoto(
  uri: string,
  filename = "check-photo.jpg",
  mimeType = "image/jpeg",
): Promise<UploadResult> {
  const token = getAccessToken();
  if (!token) throw new ApiError("Sign in again to upload photos", "UNAUTHORIZED", 401);

  const uploadUri = await ensureUploadableUri(uri);
  const base64 = await FileSystem.readAsStringAsync(uploadUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64?.length) {
    throw new ApiError("Could not read the photo. Try again.", "READ_FAILED", 0);
  }

  let res: Response;
  try {
    res = await fetch(`${getBackendUrl()}/api/upload/json`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Alenio-Upload": "base64",
      },
      body: JSON.stringify({
        filename: asciiFilename(filename),
        contentType: mimeType.trim() || "image/jpeg",
        data: base64,
      }),
    });
  } catch {
    throw new ApiError(
      "You’re offline. Photos stay on this device until sync.",
      "NETWORK_ERROR",
      0,
    );
  }

  const body = (await res.json().catch(() => null)) as {
    data?: UploadResult;
    error?: { message?: string; code?: string };
  } | null;

  if (!res.ok || !body?.data?.url) {
    throw new ApiError(
      body?.error?.message ?? `Upload failed (${res.status})`,
      body?.error?.code ?? "UPLOAD_ERROR",
      res.status,
    );
  }
  return body.data;
}
