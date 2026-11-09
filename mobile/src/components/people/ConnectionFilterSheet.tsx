import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import type { ConnectionDirectoryFilters } from "@/lib/connection-directory";
import { colors } from "@/theme";

export const EMPTY_CONNECTION_FILTERS: ConnectionDirectoryFilters = {
  active: false,
  recent: false,
  sharedWorkspace: false,
};

type Props = {
  visible: boolean;
  value: ConnectionDirectoryFilters;
  onClose: () => void;
  onApply: (filters: ConnectionDirectoryFilters) => void;
};

export function ConnectionFilterSheet({
  visible,
  value,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  const toggle = (key: keyof ConnectionDirectoryFilters) => {
    setDraft((current) => ({ ...current, [key]: !current[key] }));
  };

  const footer = (
    <View style={styles.footer}>
      <Pressable
        onPress={() => setDraft(EMPTY_CONNECTION_FILTERS)}
        style={styles.clearButton}
        accessibilityRole="button"
      >
        <Text style={styles.clearText}>Clear</Text>
      </Pressable>
      <Pressable
        onPress={() => onApply(draft)}
        style={styles.applyButton}
        accessibilityRole="button"
      >
        <Text style={styles.applyText}>Apply filters</Text>
      </Pressable>
    </View>
  );

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Filter connections"
      subtitle="Narrow your connection list"
      onClose={onClose}
      compact
      showCloseButton
      scrollEnabled={false}
      footer={footer}
      testID="connections-filter-sheet"
    >
      <FilterOption
        label="Active now"
        description="Available right now"
        selected={draft.active}
        onPress={() => toggle("active")}
      />
      <FilterOption
        label="Recent"
        description="Connected in the last 30 days"
        selected={draft.recent}
        onPress={() => toggle("recent")}
      />
      <FilterOption
        label="Shared workspace"
        description="People in one of your workspaces"
        selected={draft.sharedWorkspace}
        onPress={() => toggle("sharedWorkspace")}
      />
    </AlenioBottomSheet>
  );
}

function FilterOption({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, selected ? styles.optionSelected : null]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      <View style={styles.optionCopy}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <View style={[styles.checkbox, selected ? styles.checkboxSelected : null]}>
        {selected ? <Check size={14} color="#FFFFFF" strokeWidth={2.8} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    backgroundColor: "#FFFFFF",
  },
  optionSelected: {
    borderColor: "#C7C0FF",
    backgroundColor: "#F8F7FF",
  },
  optionCopy: { flex: 1, minWidth: 0 },
  optionLabel: { fontSize: 12, fontWeight: "700", color: "#192133" },
  optionDescription: { marginTop: 1, fontSize: 9.5, color: "#8490A2" },
  checkbox: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#CDD3DD",
    backgroundColor: "#FFFFFF",
  },
  checkboxSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  footer: { flexDirection: "row", gap: 9 },
  clearButton: {
    minWidth: 78,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DFE3EA",
    backgroundColor: "#FFFFFF",
  },
  clearText: { fontSize: 12.5, fontWeight: "700", color: "#667286" },
  applyButton: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  applyText: { fontSize: 12.5, fontWeight: "800", color: "#FFFFFF" },
});
