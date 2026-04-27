import { getAuthHeaders } from "./auth/auth-client";
import { readJsonSafe } from "./api/api";

type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
};

export type UploadPurpose = "profile" | "team";

export async function uploadFile(
  uri: string,
  filename: string,
  mimeType: string,
  options?: { purpose?: UploadPurpose; teamId?: string }
): Promise<UploadResult> {
  const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

  const formData = new FormData();
  formData.append("file", { uri, type: mimeType, name: filename } as any);
  if (options?.purpose) formData.append("purpose", options.purpose);
  if (options?.teamId) formData.append("teamId", options.teamId);
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: formData,
    headers: authHeaders,
  });

  const data = await readJsonSafe<{ data: UploadResult; error?: { message?: string; code?: string } }>(response);
  if (!response.ok) {
    const errCode = data?.error?.code ?? "";
    const prefix = errCode ? `${errCode}: ` : "";
    let message = data?.error?.message || `Upload failed (HTTP ${response.status})`;

    if (response.status === 503 && errCode === "STORAGE_NOT_CONFIGURED") {
      message +=
        " Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_STORAGE_BUCKET to your deployed backend (e.g. Railway).";
    }
    if (response.status === 401 || errCode === "UNAUTHORIZED") {
      message +=
        " Sign out and sign in again after switching servers. EXPO_PUBLIC_NEON_AUTH_URL in the app must match NEON_AUTH_URL on that backend.";
    }
    if (response.status === 500 && errCode === "UPLOAD_ERROR") {
      const m = message.toLowerCase();
      if (m.includes("private key") || m.includes("pem") || m.includes("invalid credential")) {
        message +=
          " Check FIREBASE_PRIVATE_KEY on the server: paste the full multiline key and use \\n for newlines in Railway.";
      }
      if (m.includes("does not exist") || m.includes("permission") || m.includes("403")) {
        message +=
          " Check the Firebase service account has Storage Admin (or similar) and FIREBASE_STORAGE_BUCKET matches your project.";
      }
    }

    throw new Error(`${prefix}${message}`);
  }
  return data?.data as UploadResult;
}
