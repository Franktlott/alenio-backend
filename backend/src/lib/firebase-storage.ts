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

/** Normalize private key from Railway / JSON (handles \n escapes and stray quotes). */
function normalizePrivateKey(raw: string): string {
  let k = raw.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
}

function normalizeBucketName(bucket: string): string {
  const value = bucket.trim();
  if (value.endsWith(".firebasestorage.app")) {
    return value.replace(/\.firebasestorage\.app$/i, ".appspot.com");
  }
  return value;
}

/** Bucket IDs to try: legacy appspot + console default domain. */
function bucketCandidates(): string[] {
  const raw = env.FIREBASE_STORAGE_BUCKET!.trim();
  const normalized = normalizeBucketName(raw);
  return raw === normalized ? [raw] : [normalized, raw];
}

function ensureFirebaseStorageInitialized() {
  if (!hasFirebaseStorageConfig()) return false;
  if (getApps().length > 0) return true;
  const [primary] = bucketCandidates();
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY!),
    }),
    storageBucket: primary,
  });
  return true;
}

function formatStorageError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    const msg = err instanceof Error ? err.message : String(err);
    return code ? `${code}: ${msg}` : msg;
  }
  return err instanceof Error ? err.message : String(err);
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
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  let lastErr: unknown;
  for (const bucketId of bucketCandidates()) {
    try {
      const bucket = getStorage().bucket(bucketId);
      const target = bucket.file(storagePath);

      await target.save(bytes, {
        resumable: false,
        metadata: {
          contentType,
          metadata: {
            uploadedByUserId: userId,
            originalFilename: file.name || "upload",
          },
        },
      });

      // String date for expires is unreliable across SDK versions; use ms timestamp.
      const expiresMs = Date.now() + 1000 * 60 * 60 * 24 * 365 * 10;
      const [url] = await target.getSignedUrl({
        version: "v4",
        action: "read",
        expires: expiresMs,
      });

      return {
        id: objectId,
        url,
        originalFilename: file.name || safeName,
        contentType,
        sizeBytes: file.size ?? bytes.length,
        storagePath,
      };
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(formatStorageError(lastErr));
}

export function isFirebaseStorageConfigured() {
  return hasFirebaseStorageConfig();
}
