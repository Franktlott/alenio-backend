import { fetch } from "expo/fetch";
import * as FileSystem from "expo-file-system/legacy";
import { getAuthHeaders, refreshSessionTokens } from "./auth/auth-client";
import { readJsonSafe } from "./api/api";
import { getBackendUrl } from "./backend-url";
import { uploadFileExtension } from "./upload-file-normalization";
import { uploadMaxBytes, uploadSizeLimitMessage } from "./upload-limits";

type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
};

export type UploadPurpose = "profile" | "team" | "generic";

type JsonUploadBody = {
  purpose?: UploadPurpose;
  teamId?: string;
  filename: string;
  contentType: string;
  data: string;
};

function asciiFilename(name: string): string {
  const trimmed = name.trim() || "file";
  const safe = trimmed.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  return safe.length > 0 ? safe : "file";
}

async function ensureUploadableUri(
  uri: string,
  filename: string,
  mimeType: string,
): Promise<string> {
  if (uri.startsWith("file://")) return uri;
  const ext = uploadFileExtension(filename, mimeType);
  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheDir) return uri;
  const dest = `${cacheDir}upload-${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

function formatUploadError(
  response: Response,
  data: { error?: { message?: string; code?: string } } | null,
): string {
  const errCode = data?.error?.code ?? "";
  const prefix = errCode ? `${errCode}: ` : "";
  let message =
    data?.error?.message || `Upload failed (HTTP ${response.status})`;

  if (response.status === 503 && errCode === "STORAGE_NOT_CONFIGURED") {
    message += " File storage is not set up on the server yet.";
  }
  if (response.status === 401 || errCode === "UNAUTHORIZED") {
    message += " Sign out and sign in again, then retry.";
  }
  if (response.status === 400 && errCode === "VALIDATION_ERROR") {
    message += " Try choosing the file again.";
  }
  if (response.status === 413 || errCode === "PAYLOAD_TOO_LARGE") {
    message += " Choose a smaller file.";
  }

  return `${prefix}${message}`;
}

/** JSON + base64 avoids RN FormData, which expo/fetch does not support for local files. */
async function postJsonUpload(body: JsonUploadBody): Promise<Response> {
  const BACKEND_URL = getBackendUrl();
  let authHeaders = await getAuthHeaders();
  const headers = {
    ...authHeaders,
    "Content-Type": "application/json",
    "X-Alenio-Upload": "base64",
  };

  let response = await fetch(`${BACKEND_URL}/api/upload/json`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    const recovered = await refreshSessionTokens();
    if (recovered) {
      authHeaders = await getAuthHeaders();
      response = await fetch(`${BACKEND_URL}/api/upload/json`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "X-Alenio-Upload": "base64",
        },
        body: JSON.stringify(body),
      });
    }
  }

  return response;
}

export async function uploadFile(
  uri: string,
  filename: string,
  mimeType: string,
  options?: { purpose?: UploadPurpose; teamId?: string },
): Promise<UploadResult> {
  const uploadUri = await ensureUploadableUri(uri, filename, mimeType);
  const fileInfo = await FileSystem.getInfoAsync(uploadUri);
  if (
    fileInfo.exists &&
    typeof fileInfo.size === "number" &&
    fileInfo.size > uploadMaxBytes(mimeType)
  ) {
    throw new Error(uploadSizeLimitMessage(mimeType));
  }
  const base64 = await FileSystem.readAsStringAsync(uploadUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!base64?.length) {
    throw new Error("Could not read the selected file. Try again.");
  }

  const body: JsonUploadBody = {
    purpose: options?.purpose,
    teamId: options?.teamId,
    filename: asciiFilename(filename),
    contentType: mimeType?.trim() || "image/jpeg",
    data: base64,
  };

  const response = await postJsonUpload(body);
  const data = await readJsonSafe<{
    data: UploadResult;
    error?: { message?: string; code?: string };
  }>(response);

  if (!response.ok) {
    throw new Error(formatUploadError(response, data));
  }

  if (!data?.data?.url) {
    throw new Error("Upload succeeded but no file URL was returned.");
  }

  return data.data;
}
