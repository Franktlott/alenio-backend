import type { BriefingStatus } from "../../lib/api";
import { briefingStatusBadgeClass, briefingStatusLabelUpper } from "../../lib/briefings-display";

export function BriefingStatusBadge({ status }: { status: BriefingStatus }) {
  return <span className={briefingStatusBadgeClass(status)}>{briefingStatusLabelUpper(status)}</span>;
}
