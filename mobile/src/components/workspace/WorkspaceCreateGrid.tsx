import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";

export type WorkspaceCreateItem = {
  key: string;
  label: string;
  hint: string;
  background: string;
  icon: ReactNode;
  onPress: () => void;
  testID: string;
};

/**
 * Launcher for the workspace add sheet. Icons sit in a grid so the choices
 * read at a glance instead of as a stacked list.
 */
export function WorkspaceCreateGrid({ items }: { items: WorkspaceCreateItem[] }) {
  const columns = items.length === 4 ? 2 : 3;
  const rows: WorkspaceCreateItem[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }
  return (
    <View style={styles.grid} testID="workspace-create-grid">
      {rows.map((row) => (
        <View key={row.map((item) => item.key).join("-")} style={styles.row}>
          {row.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityHint={item.hint}
              testID={item.testID}
              style={({ pressed }) => [
                styles.tile,
                pressed ? styles.tilePressed : null,
              ]}
            >
              <View style={[styles.mark, { backgroundColor: item.background }]}>
                {item.icon}
              </View>
              <Text style={styles.label} numberOfLines={2}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 8,
    paddingTop: 10,
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
  },
  tile: {
    width: 84,
    alignItems: "center",
    paddingVertical: 4,
  },
  tilePressed: {
    opacity: 0.72,
  },
  mark: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    color: "#0F172A",
    textAlign: "center",
  },
});
