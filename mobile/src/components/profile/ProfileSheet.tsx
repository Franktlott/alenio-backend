import { ProfileScreen } from "@/app/(app)/profile";
import { useProfileSheetStore } from "@/lib/state/seneca-sheet-store";

export function ProfileSheet() {
  const open = useProfileSheetStore((state) => state.open);
  const closeSheet = useProfileSheetStore((state) => state.closeSheet);
  if (!open) return null;
  return <ProfileScreen asSheet visible onClose={closeSheet} />;
}
