import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Info, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const METRIC_GOOD = "#059669";
const METRIC_PARTIAL = "#D97706";
const METRIC_BAD = "#DC2626";

type KeyRow = {
  key: string;
  label: string;
  sample: string;
  color: string;
  bg: string;
  border: string;
  description: string;
};

const CHECK_IN_KEY: KeyRow[] = [
  {
    key: "active",
    label: "Active",
    sample: "Check-in",
    color: METRIC_GOOD,
    bg: "#ECFDF5",
    border: "#A7F3D0",
    description: "Check-in is current within the workplace schedule.",
  },
  {
    key: "due_soon",
    label: "Due soon",
    sample: "Check-in",
    color: METRIC_PARTIAL,
    bg: "#FFFBEB",
    border: "#FDE68A",
    description: "Check-in window is nearly up and needs attention.",
  },
  {
    key: "due",
    label: "Due",
    sample: "Check-in",
    color: METRIC_BAD,
    bg: "#FEF2F2",
    border: "#FECACA",
    description: "No check-in yet, or last check-in is past schedule.",
  },
];

const COMPLETION_KEY: KeyRow[] = [
  {
    key: "on_track",
    label: "80–100%",
    sample: "Goals / Tasks",
    color: METRIC_GOOD,
    bg: "#ECFDF5",
    border: "#A7F3D0",
    description: "On track — goals or tasks are in a healthy range.",
  },
  {
    key: "needs_attention",
    label: "50–79%",
    sample: "Goals / Tasks",
    color: METRIC_PARTIAL,
    bg: "#FFFBEB",
    border: "#FDE68A",
    description: "Needs attention — progress is lagging and should be coached soon.",
  },
  {
    key: "off_track",
    label: "0–49%",
    sample: "Goals / Tasks",
    color: METRIC_BAD,
    bg: "#FEF2F2",
    border: "#FECACA",
    description: "Off track — goals or tasks need immediate attention.",
  },
];

type Props = {
  iconSize?: number;
  checkInRequired?: boolean;
  goalsRequired?: boolean;
};

export function NeedsAttentionKey({
  iconSize = 10,
  checkInRequired = true,
  goalsRequired = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open Needs attention key"
        hitSlop={8}
        testID="needs-attention-key"
        style={{
          width: iconSize + 6,
          height: iconSize + 6,
          borderRadius: (iconSize + 6) / 2,
          borderWidth: 1,
          borderColor: "#CBD5E1",
          backgroundColor: "#F8FAFC",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Info size={iconSize} color="#64748B" strokeWidth={2.4} />
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
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingTop: 8,
                paddingBottom: Math.max(insets.bottom, 12),
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "#E2E8F0",
                  alignSelf: "center",
                }}
              />

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
                    Needs attention
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 2 }}>
                    Status key
                  </Text>
                  <Text style={{ fontSize: 11, color: "#667085", marginTop: 2, lineHeight: 14 }}>
                    Check-in status, plus Goals & Tasks color bands.
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

              {checkInRequired ? (
                <KeySection title="Check-in" rows={CHECK_IN_KEY} />
              ) : null}
              <KeySection
                title={goalsRequired ? "Goals & Tasks" : "Tasks"}
                rows={COMPLETION_KEY.map((row) => ({
                  ...row,
                  sample: goalsRequired ? "Goals / Tasks" : "Tasks",
                }))}
              />

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

function KeySection({ title, rows }: { title: string; rows: KeyRow[] }) {
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: "#0F172A",
          paddingHorizontal: 8,
          paddingTop: 6,
          paddingBottom: 2,
        }}
      >
        {title}
      </Text>
      {rows.map((item, index) => (
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
          }}
        >
          <View
            style={{
              minWidth: 88,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: item.bg,
              borderWidth: 1,
              borderColor: item.border,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "600",
                color: "#64748B",
                textAlign: "center",
              }}
            >
              {item.sample}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontSize: 12,
                fontWeight: "800",
                color: item.color,
                textAlign: "center",
              }}
            >
              {item.label}
            </Text>
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              color: "#475569",
              lineHeight: 16,
              paddingTop: 6,
            }}
          >
            {item.description}
          </Text>
        </View>
      ))}
    </View>
  );
}
