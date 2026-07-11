import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Info, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

const BADGE_COLUMN_WIDTH = 124;

function StatusKeyBadge({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return (
    <View
      style={{
        width: BADGE_COLUMN_WIDTH,
        flexShrink: 0,
        backgroundColor: colors.bg,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 10,
        minHeight: 22,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontWeight: "700",
          color: colors.text,
          lineHeight: 12,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function StandardsStatusKey({ iconSize = 13 }: { iconSize?: number }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const items = STANDARDS_STATUS_KEY_ORDER.map((variant) =>
    STANDARDS_BADGE_LEGEND.find((entry) => entry.variant === variant),
  ).filter((entry): entry is (typeof STANDARDS_BADGE_LEGEND)[number] => Boolean(entry));

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open status key"
        hitSlop={6}
        style={{
          width: iconSize + 8,
          height: iconSize + 8,
          borderRadius: (iconSize + 8) / 2,
          borderWidth: 1,
          borderColor: "#CBD5E1",
          backgroundColor: "#F8FAFC",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Info size={iconSize} color="#64748B" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)", justifyContent: "flex-end" }}
          onPress={() => setOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()} style={{ maxHeight: "78%" }}>
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingTop: 8,
                paddingBottom: Math.max(insets.bottom, 12),
              }}
            >
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center" }} />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingTop: 10,
                  paddingBottom: 8,
                }}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "700",
                      color: "#667085",
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                    }}
                  >
                    Workplace
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 2 }}>Status key</Text>
                  <Text style={{ fontSize: 11, color: "#667085", marginTop: 2, lineHeight: 14 }}>
                    What each badge means for check-ins and development goals.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setOpen(false)}
                  hitSlop={8}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "#F1F5F9",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={15} color="#64748B" />
                </Pressable>
              </View>

              <ScrollView
                style={{ maxHeight: 300 }}
                contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 4 }}
                showsVerticalScrollIndicator={items.length > 4}
              >
                {items.map((item, index) => {
                  const colors = standardsBadgeColors(item.variant);
                  return (
                    <View
                      key={item.variant}
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 8,
                        borderTopWidth: index === 0 ? 1 : 0,
                        borderBottomWidth: 1,
                        borderColor: "#EEF2F6",
                        backgroundColor: "#FFFFFF",
                      }}
                    >
                      <StatusKeyBadge label={item.label} colors={colors} />
                      <Text style={{ flex: 1, fontSize: 11, color: "#475569", lineHeight: 15, paddingTop: 2 }}>
                        {item.description}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={{ paddingHorizontal: 12, paddingTop: 6 }}>
                <Pressable
                  onPress={() => setOpen(false)}
                  style={{
                    borderWidth: 1,
                    borderColor: "#E3E8F0",
                    borderRadius: 10,
                    paddingVertical: 9,
                    alignItems: "center",
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>Close</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
