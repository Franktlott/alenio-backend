import React from "react";
import { Pressable, Text, ScrollView, View } from "react-native";
import { colors, radii, space } from "@/theme";

export type FilterChipItem = {
  key: string;
  label: string;
};

type FilterChipProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
};

export function FilterChip({ label, selected, onPress, testID }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radii.full,
        backgroundColor: selected ? colors.brand : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.brand : colors.borderCard,
        opacity: pressed ? 0.88 : 1,
        minHeight: 30,
        justifyContent: "center",
        alignItems: "center",
      })}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: selected ? "#FFFFFF" : colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type FilterChipRowProps = {
  items: FilterChipItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  testIDPrefix?: string;
  /** Override horizontal padding (default page pad). */
  contentPaddingHorizontal?: number;
};

export function FilterChipRow({
  items,
  selectedKey,
  onSelect,
  testIDPrefix = "filter-chip",
  contentPaddingHorizontal = space.pagePad,
}: FilterChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{
        paddingHorizontal: contentPaddingHorizontal,
        gap: space.sm,
        paddingVertical: 4,
        alignItems: "center",
      }}
    >
      {items.map((item) => (
        <FilterChip
          key={item.key}
          label={item.label}
          selected={selectedKey === item.key}
          onPress={() => onSelect(item.key)}
          testID={`${testIDPrefix}-${item.key}`}
        />
      ))}
      <View style={{ width: 4 }} />
    </ScrollView>
  );
}
