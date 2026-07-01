import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import {
  STANDARDS_BADGE_LEGEND,
  standardsBadgeColors,
  type StandardsBadgeVariant,
} from "@/lib/workplace-standards";

const STANDARDS_STATUS_KEY_ORDER: StandardsBadgeVariant[] = [
  "on_track",
  "check_in_due_soon",
  "overdue_check_in",
  "no_check_in",
  "needs_active_goals",
];

export function StandardsStatusKey() {
  const [open, setOpen] = useState(false);
  const items = STANDARDS_STATUS_KEY_ORDER.map((variant) =>
    STANDARDS_BADGE_LEGEND.find((entry) => entry.variant === variant),
  ).filter((entry): entry is (typeof STANDARDS_BADGE_LEGEND)[number] => Boolean(entry));

  return (
    <View
      style={{
        marginTop: 10,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 10,
        backgroundColor: "#F8FAFC",
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }}>Status key</Text>
        <ChevronDown
          size={16}
          color="#64748B"
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}>
          {items.map((item) => {
            const colors = standardsBadgeColors(item.variant);
            return (
              <View key={item.variant} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <View
                  style={{
                    backgroundColor: colors.bg,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                    marginTop: 1,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: "800", color: colors.text, letterSpacing: 0.4 }}>
                    {item.label.toUpperCase()}
                  </Text>
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: "#475569", lineHeight: 17 }}>{item.description}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
