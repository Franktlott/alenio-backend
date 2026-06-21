import { useMemo } from "react";
import type { ChecklistLocationRow } from "../../../lib/api";
import { ChecklistKioskApp } from "./ChecklistKioskApp";
import type { KioskTaskItem, KioskTaskState } from "./checklist-kiosk-types";

type Props = {
  location: ChecklistLocationRow;
  teamName?: string;
};

/** Manager-facing mini preview showing pending and completed task states. */
export function ChecklistKioskManagerPreview({ location, teamName = "Your workspace" }: Props) {
  const items: KioskTaskItem[] = useMemo(
    () =>
      location.items.map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        sortOrder: i.sortOrder,
      })),
    [location.items],
  );

  const tasks: Record<string, KioskTaskState> = useMemo(() => {
    const now = new Date().toISOString();
    const out: Record<string, KioskTaskState> = {};
    items.forEach((item, idx) => {
      const showComplete = items.length >= 2 && idx === 1;
      out[item.id] = showComplete
        ? { signed: true, signerName: "Alex M.", signedAt: now }
        : { signed: false, signerName: "", signedAt: null };
    });
    return out;
  }, [items]);

  const signedCount = Object.values(tasks).filter((t) => t.signed).length;

  return (
    <div className="kiosk-manager-preview">
      <div className="kiosk-manager-preview__label">
        <strong>Checklist page preview</strong>
        <span>
          {items.length === 0
            ? "Associates see this page until tasks are added"
            : "Pending and completed tasks on the iPad view"}
        </span>
      </div>
      <div className="kiosk-manager-preview__device">
        <ChecklistKioskApp
          mode="preview"
          locationName={location.name}
          teamName={teamName}
          teamImage={null}
          items={items}
          tasks={tasks}
          signedCount={signedCount}
        />
      </div>
    </div>
  );
}
