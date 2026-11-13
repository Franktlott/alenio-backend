import React, { useState } from "react";
import { Alert, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderCropSheet } from "@/components/profile/HeaderCropSheet";
import {
  cropHeaderPhoto,
  pickHeaderPhoto,
  saveProfileHeaderFile,
  type HeaderPhotoPick,
} from "@/lib/profile-header";
import {
  imageMatchesHeaderFrame,
  profileHeaderFrameAspect,
  type HeaderCropRect,
} from "@/lib/profile-header-frame";

function headerErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Please try again.";
}

/** Pick a header photo, and ask which part to keep when it is not already the banner shape. */
export function useHeaderPhotoChooser(options: {
  onSaved: (url: string) => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const frameAspect = profileHeaderFrameAspect(window.width, insets.top);
  const [pending, setPending] = useState<HeaderPhotoPick | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (file: HeaderPhotoPick) => {
    setBusy(true);
    try {
      const url = await saveProfileHeaderFile(file);
      setPending(null);
      await options.onSaved(url);
    } catch (err) {
      Alert.alert("Could not update header", headerErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => {
    if (busy) return;
    try {
      const photo = await pickHeaderPhoto();
      if (!photo) return;
      if (imageMatchesHeaderFrame(photo.width, photo.height, frameAspect)) {
        await save(photo);
        return;
      }
      setPending(photo);
    } catch (err) {
      Alert.alert("Could not update header", headerErrorMessage(err));
    }
  };

  const useCrop = async (crop: HeaderCropRect) => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const cropped = await cropHeaderPhoto(pending, crop);
      const url = await saveProfileHeaderFile(cropped);
      setPending(null);
      await options.onSaved(url);
    } catch (err) {
      Alert.alert("Could not update header", headerErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <HeaderCropSheet
      photo={pending}
      frameAspect={frameAspect}
      busy={busy}
      onCancel={() => {
        if (!busy) setPending(null);
      }}
      onUse={(crop) => {
        void useCrop(crop);
      }}
    />
  );

  return { choose, busy, sheet, frameAspect };
}
