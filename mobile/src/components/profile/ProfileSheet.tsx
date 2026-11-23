import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ProfileScreen, SignOutConfirmModal, signOutOnThisDevice } from "@/app/(app)/profile";
import { useProfileSheetStore } from "@/lib/state/seneca-sheet-store";

export function ProfileSheet() {
  const open = useProfileSheetStore((state) => state.open);
  const closeSheet = useProfileSheetStore((state) => state.closeSheet);
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();

  return (
    <>
      {open ? (
        <ProfileScreen
          asSheet
          visible
          onClose={closeSheet}
          onRequestSignOut={() => {
            closeSheet();
            setTimeout(() => setConfirming(true), 280);
          }}
        />
      ) : null}
      <SignOutConfirmModal
        visible={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void signOutOnThisDevice(queryClient);
        }}
      />
    </>
  );
}
