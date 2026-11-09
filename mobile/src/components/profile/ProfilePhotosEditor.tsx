import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ImageIcon, Plus, X } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import {
  pickAttachmentImage,
  takeAttachmentPhoto,
  type PickedFile,
} from "@/lib/file-picker";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
} from "@/components/AlenioBottomSheet";
import type { PublicProfilePhoto } from "@/lib/types";
import {
  PROFILE_PHOTO_LIMIT,
  TILE_ASPECT_RATIO,
  TILE_GAP,
} from "./ProfilePhotosSection";

/** Horizontal padding of the Edit profile scroll view. */
const PAGE_PADDING = 16;

export const PROFILE_PHOTOS_QUERY_KEY = ["profile-photos"] as const;

/** Add and remove the gallery shown on the public profile. */
export function ProfilePhotosEditor() {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: photos = [] } = useQuery({
    queryKey: PROFILE_PHOTOS_QUERY_KEY,
    queryFn: () => api.get<PublicProfilePhoto[]>("/api/profile/photos"),
  });

  // Tiles keep a constant width so a half-full row lines up with a full one.
  const tileWidth =
    (width - PAGE_PADDING * 2 - TILE_GAP * (PROFILE_PHOTO_LIMIT - 1)) /
    PROFILE_PHOTO_LIMIT;
  const canAdd = photos.length < PROFILE_PHOTO_LIMIT;

  const applyPhotos = async (next: PublicProfilePhoto[]) => {
    queryClient.setQueryData(PROFILE_PHOTOS_QUERY_KEY, next);
    // The public profile renders the same list from its own endpoint.
    await queryClient.invalidateQueries({ queryKey: ["person"] });
  };

  const addPhoto = async (pick: () => Promise<PickedFile | null>) => {
    setSourceOpen(false);
    if (busy) return;
    setBusy(true);
    try {
      const file = await pick();
      if (!file) return;
      const uploaded = await uploadFile(file.uri, file.filename, file.mimeType);
      const size = await measureImage(uploaded.url);
      const next = await api.post<PublicProfilePhoto[]>(
        "/api/profile/photos",
        {
          url: uploaded.url,
          width: size?.width,
          height: size?.height,
        },
      );
      await applyPhotos(next);
    } catch (error) {
      toast({
        title: "Couldn’t add that photo",
        message: error instanceof Error ? error.message : "Please try again.",
        preset: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async (photoId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await api.delete<PublicProfilePhoto[]>(
        `/api/profile/photos/${encodeURIComponent(photoId)}`,
      );
      await applyPhotos(next);
    } catch (error) {
      toast({
        title: "Couldn’t remove that photo",
        message: error instanceof Error ? error.message : "Please try again.",
        preset: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Photos</Text>
        <View style={styles.headerRight}>
          {busy ? <ActivityIndicator size="small" color="#8A94A6" /> : null}
          <Text style={styles.count}>
            {photos.length}/{PROFILE_PHOTO_LIMIT}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        {photos.map((photo, index) => (
          <View key={photo.id} style={[styles.tile, { width: tileWidth }]}>
            <Image source={{ uri: photo.url }} style={styles.tileImage} />
            <Pressable
              onPress={() => void removePhoto(photo.id)}
              style={styles.removeBadge}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
              testID={`edit-profile-photo-remove-${index}`}
            >
              <X size={11} color="#FFFFFF" strokeWidth={3} />
            </Pressable>
          </View>
        ))}
        {canAdd ? (
          <Pressable
            onPress={() => setSourceOpen(true)}
            style={[styles.addTile, { width: tileWidth }]}
            accessibilityRole="button"
            accessibilityLabel="Add a profile photo"
            testID="edit-profile-photo-add"
          >
            <Plus size={16} color="#8A94A6" strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.helper}>
        Show up to {PROFILE_PHOTO_LIMIT} photos on your public profile.
      </Text>

      <AlenioBottomSheet
        visible={sourceOpen}
        onClose={() => setSourceOpen(false)}
        title="Add a photo"
      >
        <View style={styles.sheetOptions}>
          <AlenioSheetOption
            icon={<ImageIcon size={15} color="#FFFFFF" strokeWidth={2.2} />}
            title="Choose from library"
            onPress={() => void addPhoto(pickAttachmentImage)}
            testID="edit-profile-photo-library"
          />
          <AlenioSheetOption
            icon={<Camera size={15} color="#FFFFFF" strokeWidth={2.2} />}
            title="Take a photo"
            onPress={() => void addPhoto(takeAttachmentPhoto)}
            testID="edit-profile-photo-camera"
          />
        </View>
      </AlenioBottomSheet>
    </View>
  );
}

/** Stored so the gallery can keep a photo's aspect ratio if it is ever shown larger. */
async function measureImage(
  uri: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  header: {
    marginBottom: 8,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 11, lineHeight: 14, fontWeight: "800", color: "#536175" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  count: { fontSize: 10, fontWeight: "600", color: "#94A3B8" },
  row: { flexDirection: "row", gap: TILE_GAP },
  tile: {
    aspectRatio: TILE_ASPECT_RATIO,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#EEF1F6",
  },
  tileImage: { width: "100%", height: "100%" },
  removeBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "rgba(16,24,40,0.72)",
  },
  addTile: {
    aspectRatio: TILE_ASPECT_RATIO,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D5DBE5",
    backgroundColor: "#F7F9FC",
  },
  helper: {
    marginTop: 8,
    paddingHorizontal: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#94A3B8",
  },
  sheetOptions: { gap: 8 },
});
