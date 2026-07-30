import { parseOwnedStorageObjectFromUrl } from "./firebase-storage";

export function shouldSyncAuthImage(
  userId: string,
  currentImage: string | null,
  authImage: string | null | undefined,
): boolean {
  if (!authImage || authImage === currentImage) return false;
  if (!currentImage) return true;

  const owned = parseOwnedStorageObjectFromUrl(currentImage);
  return owned?.objectPath !== `users/${userId}/profile/avatar`;
}
