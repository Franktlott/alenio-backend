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

/** Labels match TeamMemberRow check-in / goals / tasks status copy. */
const HEALTH_LEGEND: HealthSwatch[] = [
  {
    key: "checked_in",
    color: "#128A52",
    bg: "#ECFDF5",
    border: "#A7F3D0",
    label: "Checked in",
    description: "Check-in is current within the workplace schedule.",
  },
  {
    key: "due_soon",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
    label: "Due soon",
    description: "Check-in window is nearly up and needs attention.",
  },
  {
    key: "not_started",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
    label: "Not started",
    description: "No check-in on record yet.",
  },
  {
    key: "overdue",
    color: "#E02424",
    bg: "#FEF2F2",
    border: "#FECACA",
    label: "Overdue",
    description: "Last check-in is past the workplace schedule.",
  },
  {
    key: "goals",
    color: "#6D5CE7",
    bg: "#F5F3FF",
    border: "#DDD6FE",
    label: "Goals",
    description: "Purple when active goals are below the workplace minimum.",
  },
  {
    key: "tasks_done",
    color: "#128A52",
    bg: "#ECFDF5",
    border: "#A7F3D0",
    label: "Tasks done",
    description: "Number completed this month. Green when there are completions and nothing late.",
  },
  {
    key: "tasks_open",
    color: "#64748B",
    bg: "#F8FAFC",
    border: "#E2E8F0",
    label: "Open",
    description: "Tasks still in progress. Clear means none open.",
  },
  {
    key: "tasks_late",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
    label: "Late",
    description: "Amber when some open tasks are late; red when all open are late or none done yet.",
  },
  {
    key: "optional",
    color: "#64748B",
    bg: "#F8FAFC",
    border: "#E2E8F0",
    label: "Optional",
    description: "Not required for this workplace standard.",
  },
];

function ColorSample({ item }: { item: HealthSwatch }) {
  return (
    <View
      style={{
        minWidth: 88,
        maxWidth: 104,
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
      <Text style={{ fontSize: 11, fontWeight: "700", color: item.color, lineHeight: 14, textAlign: "center" }}>
        {item.label}
      </Text>
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
                    What each check-in, goals, and tasks status means on the team list.
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
                style={{ maxHeight: 420 }}
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
