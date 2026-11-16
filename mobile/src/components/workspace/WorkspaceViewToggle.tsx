import { View } from "react-native";
import {
  CalendarDays,
  ListChecks,
  Users,
} from "lucide-react-native";
import { SegmentedControl, type SegmentOption } from "@/components/ui";
import {
  CONTENT_MAX_WIDTH,
  useAdaptiveLayout,
  useStatusClusterInset,
} from "@/lib/adaptive-layout";
import { WS } from "./workspace-ui";

export type WorkspaceViewMode =
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
  const { columnWidth } = useAdaptiveLayout();
  const cluster = useStatusClusterInset();
  const options: SegmentOption<WorkspaceViewMode>[] = [
    { key: "calendar", label: "Calendar", Icon: CalendarDays, badge: calendarBadge },
    { key: "tasks", label: "Tasks", Icon: ListChecks, badge: tasksBadge },
    // The roster was always a workspace mode; it just had no tab of its own.
    { key: "development", label: "Members", Icon: Users },
  ];

  return (
    <View
      style={{
        alignSelf: "center",
        width: "100%",
        maxWidth: Math.min(columnWidth, CONTENT_MAX_WIDTH),
        marginTop: 10,
        marginBottom: 6,
        paddingLeft: WS.pageGutter + cluster.left,
        paddingRight: WS.pageGutter + cluster.right,
      }}
    >
      <SegmentedControl
        options={options}
        value={mode}
        onChange={onChange}
        testID="workspace-view-toggle"
        testIDPrefix="workspace-view"
      />
    </View>
  );
}
