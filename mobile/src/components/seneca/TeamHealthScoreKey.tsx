import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Info, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TEAM_HEALTH_BANDS } from "@/lib/team-health-score";

/** Show best → worst in the key sheet. */
const SCORE_KEY = [...TEAM_HEALTH_BANDS].reverse();

type Props = {
  iconSize?: number;
};

export function TeamHealthScoreKey({ iconSize = 10 }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open Team Health key"
        hitSlop={8}
        testID="team-health-score-key"
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
                    Team Health
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 2 }}>
                    Score key
                  </Text>
                  <Text style={{ fontSize: 11, color: "#667085", marginTop: 2, lineHeight: 14 }}>
                    What each color and percentage range means.
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

              <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
                {SCORE_KEY.map((item, index) => (
                  <View
                    key={item.key}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 8,
                      borderTopWidth: index === 0 ? 1 : 0,
                      borderBottomWidth: 1,
                      borderColor: "#EEF2F6",
                    }}
                  >
                    <View
                      style={{
                        minWidth: 96,
                        paddingHorizontal: 8,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: item.bg,
                        borderWidth: 1,
                        borderColor: item.border,
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: item.color,
                          marginBottom: 4,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "800",
                          color: item.color,
                          textAlign: "center",
                        }}
                      >
                        {item.label}
                      </Text>
                      <Text
                        style={{
                          marginTop: 2,
                          fontSize: 10,
                          fontWeight: "700",
                          color: "#475569",
                          textAlign: "center",
                        }}
                      >
                        {item.range}
                      </Text>
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: "#475569",
                        lineHeight: 16,
                        paddingTop: 4,
                      }}
                    >
                      {item.description}
                    </Text>
                  </View>
                ))}
              </View>

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
