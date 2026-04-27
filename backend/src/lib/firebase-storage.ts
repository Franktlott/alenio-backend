import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { env } from "../env";

type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
};

function hasFirebaseStorageConfig() {
  return !!(
    env.FIREBASE_PROJECT_ID &&
    env.FIREBASE_CLIENT_EMAIL &&
    env.FIREBASE_PRIVATE_KEY &&
    env.FIREBASE_STORAGE_BUCKET
  );
}

function ensureFirebaseStorageInitialized() {
  if (!hasFirebaseStorageConfig()) return false;
  if (getApps().length > 0) return true;
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });
  return true;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadFileToFirebaseStorage(params: {
  userId: string;
  file: File;
}): Promise<UploadResult> {
  const initialized = ensureFirebaseStorageInitialized();
  if (!initialized) {
    throw new Error("Firebase Storage is not configured on the backend");
  }

  const { userId, file } = params;
  const safeName = sanitizeFilename(file.name || "upload");
  const objectId = crypto.randomUUID();
  const storagePath = `users/${userId}/uploads/${Date.now()}-${objectId}-${safeName}`;
  const bucket = getStorage().bucket();
  const target = bucket.file(storagePath);

  const bytes = Buffer.from(await file.arrayBuffer());
  await target.save(bytes, {
    resumable: false,
    metadata: {
      contentType: file.type || "application/octet-stream",
      metadata: {
        uploadedByUserId: userId,
        originalFilename: file.name || "upload",
      },
    },
  });

  const [url] = await target.getSignedUrl({
    action: "read",
    expires: "2500-01-01",
  });

  return {
    id: objectId,
    url,
    originalFilename: file.name || safeName,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size ?? bytes.length,
    storagePath,
  };
}

export function isFirebaseStorageConfigured() {
  return hasFirebaseStorageConfig();
}
