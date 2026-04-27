import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

/** Read Firebase settings from process.env (avoids stale parsed env after .env edits + hot reload). */
function getFirebaseEnv() {
  return {
    projectId: process.env.FIREBASE_PROJECT_ID?.trim(),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.trim(),
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim(),
  };
}

type UploadResult = {
  id: string;
  url: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
};

function hasFirebaseStorageConfig() {
  const e = getFirebaseEnv();
  return !!(e.projectId && e.clientEmail && e.privateKey && e.storageBucket);
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

/** Bucket IDs to try: exact env value first, then legacy *.appspot.com fallback. */
function bucketCandidates(): string[] {
  const raw = getFirebaseEnv().storageBucket!.trim();
  const normalized = normalizeBucketName(raw);
  // New Firebase projects often only have *.firebasestorage.app; appspot may 404.
  return raw === normalized ? [raw] : [raw, normalized];
}

function ensureFirebaseStorageInitialized() {
  if (!hasFirebaseStorageConfig()) return false;
  if (getApps().length > 0) return true;
  const e = getFirebaseEnv();
  const [primary] = bucketCandidates();
  initializeApp({
    credential: cert({
      projectId: e.projectId,
      clientEmail: e.clientEmail,
      privateKey: normalizePrivateKey(e.privateKey!),
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

function isStorageNotFound(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err ? (err as { code?: number | string }).code : undefined;
  return code === 404;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Parsed object in a bucket we manage (env bucket or its legacy alias). */
function parseObjectFromStorageUrl(url: string): { bucketId: string; objectPath: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  const isOurBucket = (bucketId: string) => {
    const norm = normalizeBucketName(bucketId);
    for (const c of bucketCandidates()) {
      if (c === bucketId || normalizeBucketName(c) === norm) return true;
    }
    return false;
  };

  // https://storage.googleapis.com/BUCKET/path/to/object?...
  if (u.hostname === "storage.googleapis.com" || u.hostname === "commondatastorage.googleapis.com") {
    const raw = u.pathname.replace(/^\//, "");
    const slash = raw.indexOf("/");
    if (slash <= 0) return null;
    const bucketId = raw.slice(0, slash);
    const objectPath = decodeURIComponent(raw.slice(slash + 1).replace(/\+/g, " "));
    if (!objectPath || !isOurBucket(bucketId)) return null;
    return { bucketId, objectPath };
  }

  // https://BUCKET.storage.googleapis.com/object-path
  const vhost = u.hostname.match(/^(.+)\.storage\.googleapis\.com$/);
  const vhostBucket = vhost?.[1];
  if (vhostBucket) {
    const objectPath = decodeURIComponent(u.pathname.replace(/^\//, "").replace(/\+/g, " "));
    if (!objectPath || !isOurBucket(vhostBucket)) return null;
    return { bucketId: vhostBucket, objectPath };
  }

  // https://firebasestorage.googleapis.com/v0/b/BUCKET/o/ENCODED?...
  if (u.hostname === "firebasestorage.googleapis.com") {
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    const bucketId = m?.[1];
    const encodedPath = m?.[2];
    if (!bucketId || !encodedPath) return null;
    const objectPath = decodeURIComponent(encodedPath.replace(/\+/g, " "));
    if (!objectPath || !isOurBucket(bucketId)) return null;
    return { bucketId, objectPath };
  }

  return null;
}

/**
 * Best-effort delete when `url` points at an object in this backend's Storage bucket(s).
 * No-ops for OAuth / external URLs or unparseable links.
 */
export async function deleteStorageObjectByUrlIfOwned(url: string | null | undefined): Promise<void> {
  if (!url?.trim()) return;
  if (!hasFirebaseStorageConfig()) return;
  const parsed = parseObjectFromStorageUrl(url.trim());
  if (!parsed) return;
  if (!ensureFirebaseStorageInitialized()) return;

  for (const bucketId of bucketCandidates()) {
    try {
      const bucket = getStorage().bucket(bucketId);
      const target = bucket.file(parsed.objectPath);
      await target.delete();
      return;
    } catch (e) {
      if (isStorageNotFound(e)) continue;
      return;
    }
  }
}

export type UploadSlot = "generic" | "profile" | "team";

export async function uploadFileToFirebaseStorage(params: {
  userId: string;
  file: File;
  slot?: UploadSlot;
  /** Required when slot is "team". */
  teamId?: string;
}): Promise<UploadResult> {
  const initialized = ensureFirebaseStorageInitialized();
  if (!initialized) {
    throw new Error("Firebase Storage is not configured on the backend");
  }

  const { userId, file, teamId } = params;
  const slot = params.slot ?? "generic";
  if (slot === "team" && !teamId?.trim()) {
    throw new Error("teamId is required for team photo uploads");
  }

  const safeName = sanitizeFilename(file.name || "upload");
  const objectId = crypto.randomUUID();
  let storagePath: string;
  if (slot === "profile") {
    storagePath = `users/${userId}/profile/avatar`;
  } else if (slot === "team") {
    storagePath = `teams/${teamId!.trim()}/photo`;
  } else {
    storagePath = `users/${userId}/uploads/${Date.now()}-${objectId}-${safeName}`;
  }
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

      // v4 read URLs: GCS caps the (expiration − signing time) window at 604800s exactly.
      // @google-cloud/storage compares in seconds with float math; stay well under to avoid
      // "Max allowed expiration is seven days (604800 seconds)" on some hosts / clocks.
      const MAX_V4_READ_SECONDS = 604800;
      const SAFETY_SECONDS = 3600; // 1h under the hard cap
      const expiresAt = new Date(Date.now() + (MAX_V4_READ_SECONDS - SAFETY_SECONDS) * 1000);
      const [url] = await target.getSignedUrl({
        version: "v4",
        action: "read",
        expires: expiresAt,
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

/**
 * Deletes every Storage object under `users/{userId}/` (profile, uploads, etc.).
 * Best-effort: does not throw (account deletion should still succeed if Storage fails).
 */
export async function deleteAllUserStorageObjects(userId: string): Promise<void> {
  const id = userId?.trim();
  if (!id) return;
  if (!hasFirebaseStorageConfig()) return;
  if (!ensureFirebaseStorageInitialized()) return;

  const prefix = `users/${id}/`;

  for (const bucketId of bucketCandidates()) {
    try {
      const bucket = getStorage().bucket(bucketId);
      const [files] = await bucket.getFiles({ prefix });
      for (const file of files) {
        try {
          await file.delete({ ignoreNotFound: true });
        } catch {
          /* continue with remaining objects */
        }
      }
      return;
    } catch {
      /* try next bucket alias */
    }
  }
}
