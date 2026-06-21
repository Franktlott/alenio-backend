import { useMemo } from "react";
import { ChecklistKioskApp } from "./ChecklistKioskApp";
import type { KioskTaskItem, KioskTaskState } from "./checklist-kiosk-types";

export type ChecklistPreviewItem = {
  id: string;
  title: string;
  note?: string | null;
  category?: string | null;
  sortOrder: number;
};

type Props = {
  checklistName: string;
  teamName: string;
  teamImage?: string | null;
  items: ChecklistPreviewItem[];
  className?: string;
};

/** Live iPad-style preview for checklist builder and manager tools. */
export function ChecklistKioskLivePreview({
  checklistName,
  teamName,
  teamImage = null,
  items,
  className = "",
}: Props) {
  const kioskItems: KioskTaskItem[] = useMemo(
    () =>
      items.map((i) => ({
        id: i.id,
        title: i.title,
        note: i.note ?? null,
        category: i.category ?? null,
        sortOrder: i.sortOrder,
      })),
    [items],
  );

  const tasks: Record<string, KioskTaskState> = useMemo(() => {
    const now = new Date().toISOString();
    const out: Record<string, KioskTaskState> = {};
    kioskItems.forEach((item, idx) => {
      const showComplete = kioskItems.length >= 2 && idx === 1;
      out[item.id] = showComplete
        ? { signed: true, signerName: "Alex M.", signedAt: now }
        : { signed: false, signerName: "", signedAt: null };
    });
    return out;
  }, [kioskItems]);

  const signedCount = Object.values(tasks).filter((t) => t.signed).length;
  const displayName = checklistName.trim() || "Checklist name";

  return (
    <div className={`checklist-kiosk-live-preview${className ? ` ${className}` : ""}`}>
      <div className="checklist-kiosk-live-preview__head">
        <strong>Live preview</strong>
        <span>What associates see on iPad</span>
      </div>
      <div className="checklist-kiosk-live-preview__device">
        <ChecklistKioskApp
          mode="preview"
          locationName={displayName}
          teamName={teamName}
          teamImage={teamImage}
          items={kioskItems}
          tasks={tasks}
          signedCount={signedCount}
        />
      </div>
    </div>
  );
}
