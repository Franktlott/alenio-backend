import React from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Download } from "lucide-react-native";
import type { AppVersionInfo } from "@/lib/app-version";
import { getStoreUrl, openAppStore } from "@/lib/app-version";

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
          className="w-full max-w-md rounded-3xl bg-white p-6"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="h-11 w-11 rounded-2xl bg-indigo-50 items-center justify-center mb-4">
            <Download size={22} color="#4361EE" />
          </View>
          <Text className="text-xl font-bold text-slate-900">
            {forced ? "Update required" : "Update available"}
          </Text>
          <Text className="text-[15px] leading-5 text-slate-600 mt-2 mb-5">
            {forced
              ? `This version of Alenio (${currentVersion}) is no longer supported. Please update to continue.`
              : `A newer version of Alenio (${latest}) is available. You’re on ${currentVersion}.`}
          </Text>

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
