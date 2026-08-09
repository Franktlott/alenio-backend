import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { ChevronDown, Plus } from "lucide-react-native";
import { colors } from "@/theme";
import type { WorkspaceFiltersState } from "./workspace-types";
import { taskFilterSummary } from "./workspace-utils";
import { WS } from "./workspace-ui";

type Props = {
  filters: WorkspaceFiltersState;
  selectedDay: string | null;
  onOpenFilterView: () => void;
  canCreateTask: boolean;
  onCreateTask: () => void;
};

// Widths are explicit rather than flex-driven so the create action can never be
// pushed past the right edge on a narrow screen.
const CONTROL_HEIGHT = 34;
const CONTROL_PAD_H = 12;
const CHEVRON = 12;
const ROW_GAP = 8;

export function TaskShowingRow({
  filters,
  selectedDay,
  onOpenFilterView,
  canCreateTask,
  onCreateTask,
}: Props) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.max(240, width - WS.pageGutter * 2);
  const compact = contentWidth < 320;
  const createWidth = compact ? 92 : 112;
  const selectorWidth = contentWidth - createWidth - ROW_GAP;
  const selectorTextWidth = selectorWidth - CONTROL_PAD_H * 2 - CHEVRON - 6;
  const summary = taskFilterSummary(filters, selectedDay);

  return (
    <View
      style={{
        width: contentWidth,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
      testID="task-showing-row"
    >
      <Pressable
        onPress={onOpenFilterView}
        style={{
          width: selectorWidth,
          height: CONTROL_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: CONTROL_PAD_H,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "#DDE3EC",
          backgroundColor: WS.surface,
        }}
        accessibilityRole="button"
        accessibilityLabel={`${summary}. Open Filter and View.`}
        testID="task-status-selector"
      >
        <Text
          style={{
            width: selectorTextWidth,
            fontSize: 12.5,
            lineHeight: 15,
            fontWeight: "600",
            color: WS.ink,
          }}
          numberOfLines={1}
        >
          {summary}
        </Text>
        <ChevronDown size={CHEVRON} color={WS.muted} strokeWidth={2.2} />
      </Pressable>

      {canCreateTask ? (
        <Pressable
          onPress={onCreateTask}
          style={{
            width: createWidth,
            height: CONTROL_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: CONTROL_PAD_H,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.brandSoft,
            backgroundColor: colors.brandSoft,
          }}
          accessibilityRole="button"
          accessibilityLabel="New Task"
          testID="task-new-button"
        >
          <Plus size={12} color={colors.brand} strokeWidth={2.8} />
          <Text
            style={{
              marginLeft: 3,
              fontSize: 12,
              lineHeight: 14,
              fontWeight: "700",
              color: colors.brand,
            }}
            numberOfLines={1}
          >
            {compact ? "New" : "New Task"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
