import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ImageIcon, X } from "lucide-react-native";
import type { PublicProfilePhoto } from "@/lib/types";

const BRAND = "#4361EE";
/** Landscape cards shown on the profile before View all. */
const PREVIEW_COUNT = 2;
/** Shared with the edit-profile gallery, which still uses the portrait strip. */
export const TILE_GAP = 6;
export const PROFILE_PHOTO_LIMIT = 5;
export const TILE_ASPECT_RATIO = 0.78;

type Props = {
  photos: PublicProfilePhoto[];
};

/**
 * Read-only gallery on the public profile. Photos are added and removed from
 * the Edit profile screen, so nothing renders here until there is one to show.
 */
export function ProfilePhotosSection({ photos }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const preview = photos.slice(0, PREVIEW_COUNT);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <ImageIcon size={16} color="#111A2B" strokeWidth={2.2} />
        <Text style={styles.title}>Photos</Text>
        <View style={styles.headerSpacer} />
        <Pressable
          onPress={() => setViewerIndex(0)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="View all photos"
          testID="profile-photos-view-all"
        >
          <Text style={styles.viewAll}>View all</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {preview.map((photo, index) => (
          <Pressable
            key={photo.id}
            onPress={() => setViewerIndex(index)}
            style={styles.tile}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Profile photo ${index + 1}`}
            testID={`profile-photo-${index}`}
          >
            <Image source={{ uri: photo.url }} style={styles.tileImage} />
          </Pressable>
        ))}
      </View>

      <PhotoViewer
        photos={photos}
        startIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

function PhotoViewer({
  photos,
  startIndex,
  onClose,
}: {
  photos: PublicProfilePhoto[];
  startIndex: number | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  if (startIndex == null) return null;

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.viewer}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: startIndex * width, y: 0 }}
        >
          {photos.map((photo) => (
            <Image
              key={photo.id}
              source={{ uri: photo.url }}
              style={{ width, height }}
              resizeMode="contain"
            />
          ))}
        </ScrollView>
        <Pressable
          onPress={onClose}
          style={[styles.viewerClose, { top: insets.top + 8 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          testID="profile-photo-viewer-close"
        >
          <X size={18} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  headerSpacer: { flex: 1 },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    color: "#111A2B",
    letterSpacing: -0.3,
  },
  viewAll: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: BRAND },
  row: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    aspectRatio: 1.35,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#EEF1F6",
  },
  tileImage: { width: "100%", height: "100%" },
  viewer: { flex: 1, backgroundColor: "#000000" },
  viewerClose: {
    position: "absolute",
    right: 16,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
});
