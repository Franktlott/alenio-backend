import { getAuthHeaders } from "./auth/auth-client";
import { readJsonSafe } from "./api/api";

type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
};

export async function uploadFile(
  uri: string,
  filename: string,
  mimeType: string
): Promise<UploadResult> {
  const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

  const formData = new FormData();
  formData.append("file", { uri, type: mimeType, name: filename } as any);
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: formData,
    headers: authHeaders,
  });

  const data = await readJsonSafe<{ data: UploadResult; error?: { message?: string } }>(response);
  if (!response.ok) throw new Error(data?.error?.message || "Upload failed");
  return data?.data as UploadResult;
}
