import type { CheckDraft, SyncDraftItem } from "./check-draft-store";
import { uploadLocalPhoto } from "./upload";

/** Upload any local photos that do not yet have a remote URL; return updated sync items. */
export async function uploadPendingDraftPhotos(
  draft: CheckDraft,
): Promise<SyncDraftItem[]> {
  const nextItems: SyncDraftItem[] = [];

  for (const item of draft.syncItems) {
    const localPhotos = [...(item.localPhotos ?? [])];
    const photoUrls = new Set(item.photoUrls ?? []);

    for (let i = 0; i < localPhotos.length; i++) {
      const photo = localPhotos[i]!;
      if (photo.uploadedUrl) {
        photoUrls.add(photo.uploadedUrl);
        continue;
      }
      const uploaded = await uploadLocalPhoto(
        photo.uri,
        `temps-${item.itemId}-${photo.id}.jpg`,
      );
      localPhotos[i] = { ...photo, uploadedUrl: uploaded.url };
      photoUrls.add(uploaded.url);
    }

    nextItems.push({
      ...item,
      localPhotos,
      photoUrls: [...photoUrls],
    });
  }

  return nextItems;
}
