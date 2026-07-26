import React from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Download } from "lucide-react-native";
import type { AppVersionInfo } from "@/lib/app-version";
import { getStoreUrl, openAppStore, resolveUpdateNotes } from "@/lib/app-version";

type Props = {
  visible: boolean;
  forced: boolean;
  info: AppVersionInfo;
  currentVersion: string;
  onDismiss?: () => void;
};

export function AppUpdateModal({ visible, forced, info, currentVersion, onDismiss }: Props) {
  const hasStoreLink = !!getStoreUrl(info);
  const latest = info.latestVersion?.trim() || "a newer version";
  const notes = resolveUpdateNotes(info);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={forced ? undefined : onDismiss}
    >
      <Pressable
        className="flex-1 bg-black/45 items-center justify-center px-6"
        onPress={forced ? undefined : onDismiss}
      >
        <Pressable
          className="w-full max-w-md rounded-3xl bg-white p-6 max-h-[80%]"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="h-11 w-11 rounded-2xl bg-indigo-50 items-center justify-center mb-4">
            <Download size={22} color="#4361EE" />
          </View>
          <Text className="text-xl font-bold text-slate-900">
            {forced ? "Update required" : notes.title || "Update available"}
          </Text>
          <Text className="text-[15px] leading-5 text-slate-600 mt-2 mb-4">
            {forced
              ? `This version of Alenio (${currentVersion}) is no longer supported. Please update to continue.`
              : `A newer version of Alenio (${latest}) is available. You’re on ${currentVersion}.`}
          </Text>

          {notes.bullets.length > 0 ? (
            <ScrollView className="mb-5" style={{ maxHeight: 180 }} bounces={false}>
              <View className="gap-3">
                {notes.bullets.map((bullet) => (
                  <View key={bullet} className="flex-row gap-2">
                    <Text className="text-indigo-600 font-bold mt-0.5">•</Text>
                    <Text className="flex-1 text-[15px] leading-5 text-slate-700">{bullet}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}

          {hasStoreLink ? (
            <TouchableOpacity
              onPress={() => {
                void openAppStore(info);
              }}
              className="bg-indigo-600 rounded-2xl py-3.5 items-center"
              activeOpacity={0.85}
              testID="app-update-open-store"
            >
              <Text className="text-white font-semibold text-base">Update now</Text>
            </TouchableOpacity>
          ) : (
            <Text className="text-sm text-slate-500 text-center mb-2">
              Open the App Store or Play Store and update Alenio.
            </Text>
          )}

          {!forced ? (
            <TouchableOpacity
              onPress={onDismiss}
              className="py-3.5 items-center mt-1"
              activeOpacity={0.7}
              testID="app-update-later"
            >
              <Text className="text-slate-500 font-medium text-base">Not now</Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
