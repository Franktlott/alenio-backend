import type { ReactNode } from "react";
import { View } from "react-native";
import { AlenioList, AlenioListRow, IconTile, type TintName } from "@/components/ui";

export type WorkspaceCreateItem = {
  key: string;
  label: string;
  hint: string;
  tint?: TintName;
  icon: ReactNode;
  onPress: () => void;
  testID: string;
};

/** Create choices as a kit list — same language as Workspace Settings. */
export function WorkspaceCreateGrid({ items }: { items: WorkspaceCreateItem[] }) {
  return (
    <View testID="workspace-create-grid">
      <AlenioList>
        {items.map((item) => {
          const tint = item.tint ?? "lavender";
          return (
            <AlenioListRow
              key={item.key}
              testID={item.testID}
              accessibilityLabel={`${item.label}. ${item.hint}`}
              leading={<IconTile tint={tint}>{item.icon}</IconTile>}
              title={item.label}
              subtitle={item.hint}
              chevron
              onPress={item.onPress}
            />
          );
        })}
      </AlenioList>
    </View>
  );
}
