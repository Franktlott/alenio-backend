import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Info, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type HealthSwatch = {
  key: string;
  color: string;
  bg: string;
  border: string;
  label: string;
  description: string;
};

const HEALTH_LEGEND: HealthSwatch[] = [
  {
    key: "good",
    color: "#047857",
    bg: "#ECFDF5",
    border: "#A7F3D0",
    label: "Green",
    description: "Check-in is current, or goals meet the workplace minimum.",
  },
  {
    key: "attention",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
    label: "Amber",
    description: "Check-in is due soon and needs attention.",
  },
  {
    key: "critical",
    color: "#B91C1C",
    bg: "#FEF2F2",
    border: "#FECACA",
    label: "Red",
    description: "Check-in is overdue or missing, or goals are below the required minimum.",
  },
  {
    key: "neutral",
    color: "#475569",
    bg: "#F8FAFC",
    border: "#E2E8F0",
    label: "Grey",
    description: "Not required for this workplace standard.",
  },
];

function ColorSample({ item }: { item: HealthSwatch }) {
  return (
    <View
      style={{
        width: 72,
        flexShrink: 0,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
        backgroundColor: item.bg,
        borderWidth: 1,
        borderColor: item.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color: item.color, lineHeight: 14 }}>{item.label}</Text>
    </View>
  );
}

export function StandardsStatusKey({ iconSize = 13 }: { iconSize?: number }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

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
                    Check-in and Goals colors show each member’s standards health.
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
                showsVerticalScrollIndicator={false}
              >
                {HEALTH_LEGEND.map((item, index) => (
                  <View
                    key={item.key}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderTopWidth: index === 0 ? 1 : 0,
                      borderBottomWidth: 1,
                      borderColor: "#EEF2F6",
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <ColorSample item={item} />
                    <Text style={{ flex: 1, fontSize: 12, color: "#475569", lineHeight: 16, paddingTop: 2 }}>
                      {item.description}
                    </Text>
                  </View>
                ))}
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
