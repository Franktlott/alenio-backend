import {
  CalendarDays,
  ListChecks,
  Megaphone,
  Users,
} from "lucide-react-native";
import { SegmentedControl, type SegmentOption } from "@/components/ui";
import { useStatusClusterInset } from "@/lib/adaptive-layout";
import { WS } from "./workspace-ui";

export type WorkspaceViewMode =
  | "updates"
  | "calendar"
  | "tasks"
  | "development";

type Props = {
  mode: WorkspaceViewMode;
  onChange: (mode: WorkspaceViewMode) => void;
  calendarBadge?: number;
  tasksBadge?: number;
};

export function WorkspaceViewToggle({
  mode,
  onChange,
  calendarBadge = 0,
  tasksBadge = 0,
}: Props) {
  const cluster = useStatusClusterInset();
  const options: SegmentOption<WorkspaceViewMode>[] = [
    { key: "updates", label: "Feed", Icon: Megaphone },
    { key: "calendar", label: "Calendar", Icon: CalendarDays, badge: calendarBadge },
    { key: "tasks", label: "Tasks", Icon: ListChecks, badge: tasksBadge },
    // The roster was always a workspace mode; it just had no tab of its own.
    { key: "development", label: "Members", Icon: Users },
  ];

  return (
    <SegmentedControl
      options={options}
      value={mode}
      onChange={onChange}
      testID="workspace-view-toggle"
      testIDPrefix="workspace-view"
      style={{
        marginTop: 10,
        marginBottom: 6,
        marginLeft: WS.pageGutter + cluster.left,
        marginRight: WS.pageGutter + cluster.right,
      }}
    />
  );
}
