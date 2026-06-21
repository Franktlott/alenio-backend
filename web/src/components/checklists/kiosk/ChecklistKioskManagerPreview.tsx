import type { ChecklistLocationRow } from "../../../lib/api";
import { ChecklistKioskLivePreview } from "./ChecklistKioskLivePreview";

type Props = {
  location: ChecklistLocationRow;
  teamName?: string;
};

/** Manager-facing mini preview showing pending and completed task states. */
export function ChecklistKioskManagerPreview({ location, teamName = "Your workspace" }: Props) {
  return (
    <ChecklistKioskLivePreview
      checklistName={location.name}
      teamName={teamName}
      teamImage={null}
      items={location.items.map((i) => ({
        id: i.id,
        title: i.title,
        note: i.note ?? null,
        category: i.category,
        sortOrder: i.sortOrder,
      }))}
      className="kiosk-manager-preview"
    />
  );
}
