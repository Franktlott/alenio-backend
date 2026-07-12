import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Info, Video, UserRound, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type KeyItem = {
  id: string;
  title: string;
  description: string;
  preview: "eventBar" | "video" | "taskDot" | "holidayDot" | "multi" | "checkIn";
};

const CALENDAR_ICON_KEY: KeyItem[] = [
  {
    id: "event",
    title: "Calendar event",
    description: "Colored bar for a team or personal event.",
    preview: "eventBar",
  },
  {
    id: "meeting",
    title: "Virtual meeting",
    description: "Video icon means a join link is included.",
    preview: "video",
  },
  {
    id: "checkIn",
    title: "Check-in",
    description: "Person icon for one-on-one check-ins.",
    preview: "checkIn",
  },
  {
    id: "task",
    title: "Task due",
    description: "Blue dot under a date with due tasks.",
    preview: "taskDot",
  },
  {
    id: "holiday",
    title: "Holiday",
    description: "Red dot marks a holiday.",
    preview: "holidayDot",
  },
  {
    id: "multi",
    title: "Multiple items",
    description: "Number badge means more than one event that day.",
    preview: "multi",
  },
];

function KeyPreview({ kind }: { kind: KeyItem["preview"] }) {
  if (kind === "eventBar") {
    return (
      <View
        style={{
          width: 28,
          height: 9,
          borderRadius: 3,
          backgroundColor: "#4361EE26",
          borderWidth: 1,
          borderColor: "#4361EE40",
        }}
      />
    );
  }
  if (kind === "video") {
    return (
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Video size={12} color="#4361EE" strokeWidth={2.25} />
      </View>
    );
  }
  if (kind === "checkIn") {
    return (
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: "#ECFDF5",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <UserRound size={12} color="#047857" strokeWidth={2.25} />
      </View>
    );
  }
  if (kind === "taskDot") {
    return <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#4361EE" }} />;
  }
  if (kind === "holidayDot") {
    return <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#EF4444" }} />;
  }
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: "#4361EE26",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#4361EE", fontSize: 9, fontWeight: "700" }}>3</Text>
    </View>
  );
}

export function CalendarIconKey({ iconSize = 13 }: { iconSize?: number }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.min(Math.round(windowHeight * 0.62), 420);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open calendar icon key"
        hitSlop={6}
        testID="calendar-icon-key-button"
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
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15, 23, 42, 0.45)" }}
            onPress={() => setOpen(false)}
          />
          <View
            style={{
              height: sheetHeight,
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingTop: 6,
              paddingBottom: Math.max(insets.bottom, 10),
            }}
          >
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center" }} />

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingTop: 8,
                paddingBottom: 6,
              }}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "700",
                    color: "#667085",
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                  }}
                >
                  Calendar
                </Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827", marginTop: 1 }}>Icon key</Text>
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
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 4 }}
              showsVerticalScrollIndicator
              bounces
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {CALENDAR_ICON_KEY.map((item, index) => (
                <View
                  key={item.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 7,
                    paddingHorizontal: 6,
                    borderTopWidth: index === 0 ? 1 : 0,
                    borderBottomWidth: 1,
                    borderColor: "#EEF2F6",
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 26,
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <KeyPreview kind={item.preview} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A" }}>{item.title}</Text>
                    <Text style={{ fontSize: 11, color: "#64748B", lineHeight: 14, marginTop: 1 }}>
                      {item.description}
                    </Text>
                  </View>
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
                  paddingVertical: 8,
                  alignItems: "center",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
