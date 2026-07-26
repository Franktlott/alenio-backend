import React from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import type { WhatsNewEntry } from "@/lib/whats-new";

type Props = {
  visible: boolean;
  version: string;
  entry: WhatsNewEntry;
  onDismiss: () => void;
};

export function WhatsNewModal({ visible, version, entry, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        className="flex-1 bg-black/45 items-center justify-center px-6"
        onPress={onDismiss}
      >
        <Pressable
          className="w-full max-w-md rounded-3xl bg-white p-6"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="h-11 w-11 rounded-2xl bg-indigo-50 items-center justify-center mb-4">
            <Sparkles size={22} color="#4361EE" />
          </View>
          <Text className="text-xl font-bold text-slate-900">{entry.title}</Text>
          <Text className="text-sm text-slate-500 mt-1 mb-4">Version {version}</Text>
          <View className="gap-3 mb-6">
            {entry.bullets.map((bullet) => (
              <View key={bullet} className="flex-row gap-2">
                <Text className="text-indigo-600 font-bold mt-0.5">•</Text>
                <Text className="flex-1 text-[15px] leading-5 text-slate-700">{bullet}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            onPress={onDismiss}
            className="bg-indigo-600 rounded-2xl py-3.5 items-center"
            activeOpacity={0.85}
            testID="whats-new-got-it"
          >
            <Text className="text-white font-semibold text-base">Got it</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
