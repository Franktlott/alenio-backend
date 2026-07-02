import type { BriefingStatus } from "../../lib/api";
import { briefingStatusBadgeClass, briefingStatusLabel } from "../../lib/briefings-display";

export function BriefingStatusBadge({ status }: { status: BriefingStatus }) {
  return <span className={briefingStatusBadgeClass(status)}>{briefingStatusLabel(status)}</span>;
}
