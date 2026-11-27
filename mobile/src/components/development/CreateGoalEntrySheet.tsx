import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Pencil, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";
import { MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/modal-supported-orientations";

export type CreateGoalEntryMode = "seneca" | "scratch";

type Props = {
  visible: boolean;
  memberName: string;
  /** Signed-in person is creating a goal for themselves. */
  isSelf?: boolean;
  onClose: () => void;
  onSelect: (mode: CreateGoalEntryMode) => void;
};

export function CreateGoalEntrySheet({
  visible,
  memberName,
  isSelf = false,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const firstName =
    memberName.trim().split(/\s+/)[0] || memberName || "this teammate";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.42)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "#FFFFFF",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: Math.max(insets.bottom, 14),
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#DCE5F2",
              alignSelf: "center",
              marginTop: 8,
              marginBottom: 4,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#EEF2F6",
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ fontSize: 15, fontWeight: "800", color: "#0F172A" }}
                numberOfLines={1}
              >
                Add a goal
              </Text>
              <Text
                style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}
                numberOfLines={1}
              >
                {isSelf
                  ? "How do you want to start your goal?"
                  : `How do you want to start ${firstName}'s goal?`}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityLabel="Close"
            >
              <X size={15} color="#64748B" />
            </Pressable>
          </View>

          <Pressable
            onPress={() => onSelect("seneca")}
            style={{
              minHeight: 64,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#EEF2F6",
            }}
            accessibilityRole="button"
            accessibilityLabel="Generate with Seneca"
            testID="create-goal-entry-seneca"
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#F5F3FF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SenecaIcon size={26} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#5B21B6" }}>
                Generate with Seneca
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  lineHeight: 16,
                  color: "#64748B",
                }}
              >
                Describe a skill — Seneca drafts the title and actions.
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => onSelect("scratch")}
            style={{
              minHeight: 64,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel="Start from scratch"
            testID="create-goal-entry-scratch"
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#EEF2FF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Pencil size={18} color="#4361EE" strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>
                Start from scratch
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  lineHeight: 16,
                  color: "#64748B",
                }}
              >
                Write the skill and actions yourself.
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
