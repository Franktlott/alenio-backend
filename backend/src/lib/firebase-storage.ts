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

export type CopiedUserUploadResult = {
  url: string;
  contentType: string;
  sizeBytes: number;
  filename: string;
  storagePath: string;
};

export class StorageCopyError extends Error {
  constructor(
    message: string,
    readonly code:
      | "STORAGE_NOT_CONFIGURED"
      | "SOURCE_URL_INVALID"
      | "SOURCE_NOT_FOUND"
      | "SOURCE_NOT_IMAGE"
      | "SOURCE_SIZE_INVALID"
      | "COPY_FAILED",
  ) {
    super(message);
    this.name = "StorageCopyError";
  }
}

export function buildUserUploadStoragePath(params: {
  userId: string;
  filename: string;
  nowMs?: number;
  objectId?: string;
}): string {
  const filename = sanitizeFilename(params.filename) || "upload";
  return `users/${params.userId}/uploads/${params.nowMs ?? Date.now()}-${params.objectId ?? crypto.randomUUID()}-${filename}`;
}

export function buildCopiedUserUploadMetadata(params: {
  contentType: string;
  userId: string;
  filename: string;
  sourcePath: string;
  downloadToken: string;
  sourceMetadata?: Record<string, string>;
}) {
  const metadata: Record<string, string> = {
    ...(params.sourceMetadata ?? {}),
    firebaseStorageDownloadTokens: params.downloadToken,
    uploadedByUserId: params.userId,
    originalFilename: params.filename,
    copiedFromStoragePath: params.sourcePath,
  };
  return {
    contentType: params.contentType,
    metadata,
  };
}

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
  const raw = getFirebaseEnv().storageBucket?.trim();
  if (!raw) return [];
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

/** Stable read URL via Firebase token (no time-limited GCS signing). */
function firebaseDownloadMediaUrl(bucketId: string, objectPath: string, downloadToken: string): string {
  const pathEnc = encodeURIComponent(objectPath);
  const bucketEnc = encodeURIComponent(bucketId);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketEnc}/o/${pathEnc}?alt=media&token=${encodeURIComponent(
    downloadToken
  )}`;
}

function pickFirebaseDownloadToken(
  fromUpload: string,
  gcsUserMetadata: Record<string, string> | undefined
): string {
  if (gcsUserMetadata) {
    for (const [k, v] of Object.entries(gcsUserMetadata)) {
      if (k.toLowerCase() === "firebasestoragedownloadtokens" && v?.trim()) {
        return v.trim().split(",")[0]!.trim();
      }
    }
  }
  return fromUpload;
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

/** Public helper: resolve an Alenio-owned Storage object path from a download URL. */
export function parseOwnedStorageObjectFromUrl(
  url: string,
): { bucketId: string; objectPath: string } | null {
  return parseObjectFromStorageUrl(url.trim());
}

export async function readStorageObjectByUrl(
  url: string,
  options?: { maxBytes?: number },
): Promise<{ bytes: Buffer; contentType: string; sizeBytes: number } | null> {
  const parsed = parseObjectFromStorageUrl(url.trim());
  if (!parsed) return null;
  if (!ensureFirebaseStorageInitialized()) return null;

  let lastErr: unknown;
  for (const bucketId of bucketCandidates()) {
    try {
      const file = getStorage().bucket(bucketId).file(parsed.objectPath);
      const [meta] = await file.getMetadata();
      const sizeBytes = Number(meta.size);
      if (
        options?.maxBytes !== undefined &&
        Number.isFinite(sizeBytes) &&
        sizeBytes > options.maxBytes
      ) {
        throw new StorageObjectTooLargeError(sizeBytes, options.maxBytes);
      }
      const [bytes] = await file.download();
      return {
        bytes,
        contentType: meta.contentType || "application/octet-stream",
        sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : bytes.length,
      };
    } catch (e) {
      if (e instanceof StorageObjectTooLargeError) throw e;
      lastErr = e;
      if (isStorageNotFound(e)) continue;
      throw new Error(formatStorageError(e));
    }
  }

  if (lastErr && !isStorageNotFound(lastErr)) {
    throw new Error(formatStorageError(lastErr));
  }
  return null;
}

/**
 * Copies an owned Storage object into the durable generic-upload namespace.
 * GCS performs the copy server-side; image bytes are never returned to callers.
 */
export async function copyOwnedStorageObjectToUserUploads(params: {
  sourceUrl: string;
  userId: string;
  filename?: string;
}): Promise<CopiedUserUploadResult> {
  if (!ensureFirebaseStorageInitialized()) {
    throw new StorageCopyError(
      "Firebase Storage is not configured on the backend",
      "STORAGE_NOT_CONFIGURED",
    );
  }
  const parsed = parseObjectFromStorageUrl(params.sourceUrl.trim());
  if (!parsed) {
    throw new StorageCopyError("Source URL is not in configured Firebase Storage", "SOURCE_URL_INVALID");
  }

  let lastErr: unknown;
  for (const bucketId of bucketCandidates()) {
    const bucket = getStorage().bucket(bucketId);
    const source = bucket.file(parsed.objectPath);
    try {
      const [meta] = await source.getMetadata();
      const contentType = meta.contentType?.trim() || "";
      if (!contentType.toLowerCase().startsWith("image/")) {
        throw new StorageCopyError("Source object is not an image", "SOURCE_NOT_IMAGE");
      }
      const sizeBytes = Number(meta.size);
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        throw new StorageCopyError("Source image has an invalid size", "SOURCE_SIZE_INVALID");
      }

      const sourceMetadata = meta.metadata as Record<string, string> | undefined;
      const pathFilename = parsed.objectPath.split("/").pop() || "seneca-image";
      const filename = sanitizeFilename(
        params.filename?.trim() ||
          sourceMetadata?.originalFilename?.trim() ||
          pathFilename,
      ) || "seneca-image";
      const objectId = crypto.randomUUID();
      const storagePath = buildUserUploadStoragePath({
        userId: params.userId,
        filename,
        objectId,
      });
      const target = bucket.file(storagePath);
      const downloadToken = crypto.randomUUID();

      await source.copy(target);
      await target.setMetadata(buildCopiedUserUploadMetadata({
        contentType,
        userId: params.userId,
        filename,
        sourcePath: parsed.objectPath,
        downloadToken,
        sourceMetadata,
      }));

      return {
        url: firebaseDownloadMediaUrl(bucketId, storagePath, downloadToken),
        contentType,
        sizeBytes,
        filename,
        storagePath,
      };
    } catch (error) {
      if (error instanceof StorageCopyError) throw error;
      lastErr = error;
      if (isStorageNotFound(error)) continue;
      throw new StorageCopyError(formatStorageError(error), "COPY_FAILED");
    }
  }

  if (lastErr && !isStorageNotFound(lastErr)) {
    throw new StorageCopyError(formatStorageError(lastErr), "COPY_FAILED");
  }
  throw new StorageCopyError("Source image no longer exists", "SOURCE_NOT_FOUND");
}

export class StorageObjectTooLargeError extends Error {
  constructor(
    readonly sizeBytes: number,
    readonly maxBytes: number,
  ) {
    super(`Storage object is ${sizeBytes} bytes; maximum is ${maxBytes} bytes`);
    this.name = "StorageObjectTooLargeError";
  }
}

export async function fetchRemoteDocumentBytes(
  documentUrl: string,
): Promise<{ bytes: Buffer; contentType: string; sizeBytes?: number }> {
  const fromStorage = await readStorageObjectByUrl(documentUrl);
  if (fromStorage) return fromStorage;

  const res = await fetch(documentUrl);
  if (!res.ok) {
    throw new Error(`Document not found (${res.status})`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    bytes,
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
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

/** Delete the previous owned file when an image/media URL is cleared or replaced. */
export async function deleteReplacedStorageObject(
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined,
): Promise<void> {
  const prev = previousUrl?.trim() || "";
  const next = nextUrl?.trim() || "";
  if (!prev || prev === next) return;

  // Profile (and other fixed-slot) uploads overwrite the same object path with a new
  // download token. Deleting by the old URL would remove the file we just wrote.
  const prevObject = parseObjectFromStorageUrl(prev);
  const nextObject = next ? parseObjectFromStorageUrl(next) : null;
  if (
    prevObject &&
    nextObject &&
    prevObject.bucketId === nextObject.bucketId &&
    prevObject.objectPath === nextObject.objectPath
  ) {
    return;
  }

  await deleteStorageObjectByUrlIfOwned(prev);
}

/** Best-effort batch delete for chat media / photo URLs. Dedupes and ignores empties. */
export async function deleteOwnedStorageUrls(
  urls: Array<string | null | undefined>,
): Promise<void> {
  const unique = Array.from(
    new Set(urls.map((url) => url?.trim()).filter((url): url is string => Boolean(url))),
  );
  if (unique.length === 0) return;
  await Promise.all(unique.map((url) => deleteStorageObjectByUrlIfOwned(url)));
}

export type UploadSlot =
  | "generic"
  | "profile"
  | "team"
  | "go_alert_sound"
  | "go_walk_photo"
  | "seneca_image";

export async function uploadFileToFirebaseStorage(params: {
  userId: string;
  file: File;
  slot?: UploadSlot;
  /** Required when slot is "team", "go_alert_sound", or "go_walk_photo". */
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
  if (slot === "go_alert_sound" && !teamId?.trim()) {
    throw new Error("teamId is required for alert sound uploads");
  }
  if (slot === "go_walk_photo" && !teamId?.trim()) {
    throw new Error("teamId is required for walk photo uploads");
  }

  const safeName = sanitizeFilename(file.name || "upload");
  const objectId = crypto.randomUUID();
  let storagePath: string;
  if (slot === "profile") {
    storagePath = `users/${userId}/profile/avatar`;
  } else if (slot === "team") {
    storagePath = `teams/${teamId!.trim()}/photo`;
  } else if (slot === "go_alert_sound") {
    storagePath = `teams/${teamId!.trim()}/alert-sounds/${Date.now()}-${objectId}-${safeName}`;
  } else if (slot === "go_walk_photo") {
    storagePath = `teams/${teamId!.trim()}/walk-photos/${Date.now()}-${objectId}-${safeName}`;
  } else if (slot === "seneca_image") {
    storagePath = `users/${userId}/seneca-images/${Date.now()}-${objectId}-${safeName}`;
  } else {
    storagePath = `users/${userId}/uploads/${Date.now()}-${objectId}-${safeName}`;
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const downloadToken: string = crypto.randomUUID();

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
            firebaseStorageDownloadTokens: downloadToken,
            uploadedByUserId: userId,
            originalFilename: file.name || "upload",
          },
        },
      });

      let urlToken = downloadToken;
      try {
        const [meta] = await target.getMetadata();
        const userMeta = meta.metadata as Record<string, string> | undefined;
        urlToken = pickFirebaseDownloadToken(downloadToken, userMeta);
      } catch {
        /* use upload-time token if metadata read fails */
      }
      const url = firebaseDownloadMediaUrl(bucketId, storagePath, urlToken);

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

export type UserUploadObject = {
  bucketId: string;
  objectPath: string;
  /** Epoch ms when the object was uploaded (filename timestamp preferred). */
  uploadedAtMs: number;
};

/**
 * Lists objects under users/.../uploads/ across configured buckets.
 * Used by orphan cleanup — never includes profile/team/go slots.
 */
export async function listUserUploadObjects(): Promise<UserUploadObject[]> {
  if (!hasFirebaseStorageConfig()) return [];
  if (!ensureFirebaseStorageInitialized()) return [];

  const out: UserUploadObject[] = [];
  const seen = new Set<string>();

  for (const bucketId of bucketCandidates()) {
    try {
      const bucket = getStorage().bucket(bucketId);
      const [files] = await bucket.getFiles({ prefix: "users/" });
      for (const file of files) {
        const objectPath = file.name;
        if (!/\/uploads\//.test(objectPath)) continue;
        const key = `${normalizeBucketName(bucketId)}:${objectPath}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const fromName = objectPath.match(/\/uploads\/(\d{10,})-/);
        let uploadedAtMs = fromName ? Number(fromName[1]) : NaN;
        if (!Number.isFinite(uploadedAtMs)) {
          const created = file.metadata?.timeCreated;
          uploadedAtMs = created ? Date.parse(created) : 0;
        }
        out.push({ bucketId, objectPath, uploadedAtMs });
      }
      // First successful listing wins (aliases usually mirror the same objects).
      return out;
    } catch {
      /* try next bucket */
    }
  }

  return out;
}

export async function deleteStorageObjectByPath(
  bucketId: string,
  objectPath: string,
): Promise<boolean> {
  if (!objectPath?.trim()) return false;
  if (!hasFirebaseStorageConfig()) return false;
  if (!ensureFirebaseStorageInitialized()) return false;

  try {
    await getStorage().bucket(bucketId).file(objectPath).delete({ ignoreNotFound: true });
    return true;
  } catch {
    return false;
  }
}
