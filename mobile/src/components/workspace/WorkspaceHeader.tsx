import { AppTabHeader } from "@/components/AppTabHeader";
import {
  CURVED_HEADER_OVERLAP,
  CURVED_SHEET_RADIUS,
} from "@/components/CurvedTabLayout";

type Props = {
  topInset: number;
};

/** @deprecated Prefer CurvedTabLayout; kept for compatibility. */
export const WORKSPACE_HEADER_OVERLAP = CURVED_HEADER_OVERLAP;
export const WORKSPACE_SHEET_RADIUS = CURVED_SHEET_RADIUS;

export function WorkspaceHeader({ topInset }: Props) {
  return (
    <AppTabHeader
      topInset={topInset}
      testID="workspace-header"
      title="Workspace"
      subtitle="Tasks and calendar in one place"
      overlapPad={WORKSPACE_HEADER_OVERLAP}
    />
  );
}
