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
    const code = data?.error?.code ? `${data.error.code}: ` : "";
    const message = data?.error?.message || `Upload failed (HTTP ${response.status})`;
    throw new Error(`${code}${message}`);
  }
  return data?.data as UploadResult;
}
