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

export function StandardsStatusKey() {
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
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 1,
          borderColor: "#CBD5E1",
          backgroundColor: "#F8FAFC",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Info size={13} color="#64748B" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)", justifyContent: "flex-end" }}
          onPress={() => setOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()} style={{ maxHeight: "82%" }}>
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 16),
              }}
            >
              <View
                style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center" }}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  paddingHorizontal: 20,
                  paddingTop: 16,
                  paddingBottom: 12,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: "#64748B",
                      letterSpacing: 1.1,
                      textTransform: "uppercase",
                    }}
                  >
                    Workplace
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A", marginTop: 4 }}>Status key</Text>
                  <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4, lineHeight: 18 }}>
                    What each badge means for check-ins and development goals.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setOpen(false)}
                  hitSlop={8}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: "#F1F5F9",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={16} color="#64748B" />
                </Pressable>
              </View>

              <ScrollView
                style={{ maxHeight: 360 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 12 }}
                showsVerticalScrollIndicator={false}
              >
                {items.map((item) => {
                  const colors = standardsBadgeColors(item.variant);
                  return (
                    <View
                      key={item.variant}
                      style={{
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        borderRadius: 12,
                        padding: 12,
                        backgroundColor: "#FCFCFD",
                      }}
                    >
                      <View
                        style={{
                          alignSelf: "flex-start",
                          backgroundColor: colors.bg,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 999,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: "800", color: colors.text, letterSpacing: 0.4 }}>
                          {item.label.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, color: "#475569", lineHeight: 18 }}>{item.description}</Text>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
                <Pressable
                  onPress={() => setOpen(false)}
                  style={{
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center",
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#334155" }}>Close</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
