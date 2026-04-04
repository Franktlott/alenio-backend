import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { LogOut, ChevronRight, Users, Camera } from "lucide-react-native";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession, useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { pickImage, takePhoto } from "@/lib/file-picker";

export default function ProfileScreen() {
  const { data: session } = useSession();
  const invalidateSession = useInvalidateSession();
  const user = session?.user;
  const [localImage, setLocalImage] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (source: "library" | "camera") => {
      const file = source === "library" ? await pickImage() : await takePhoto();
      if (!file) throw new Error("cancelled");

      // Show local preview immediately
      setLocalImage(file.uri);

      // Upload to storage
      const uploaded = await uploadFile(file.uri, file.filename, file.mimeType);

      // Save to profile
      await api.patch<{ id: string; name: string; email: string; image: string | null }>(
        "/api/profile",
        { image: uploaded.url }
      );
      return uploaded.url;
    },
    onSuccess: async () => {
      await invalidateSession();
    },
    onError: (err: Error) => {
      setLocalImage(null);
      if (err.message !== "cancelled") {
        Alert.alert("Upload failed", "Could not update your profile photo. Please try again.");
      }
    },
  });

  const handlePhotoPress = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Choose from library", "Take photo"],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) uploadMutation.mutate("library");
          if (index === 2) uploadMutation.mutate("camera");
        }
      );
    } else {
      Alert.alert("Profile photo", "Choose an option", [
        { text: "Choose from library", onPress: () => uploadMutation.mutate("library") },
        { text: "Take photo", onPress: () => uploadMutation.mutate("camera") },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await authClient.signOut();
          await invalidateSession();
        },
      },
    ]);
  };

  const avatarUri = localImage ?? user?.image ?? null;

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]}>
      {/* Gradient header with avatar */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View className="px-4 pt-2 pb-8 flex-row items-center">
          {/* Tappable avatar with camera badge */}
          <TouchableOpacity
            onPress={handlePhotoPress}
            disabled={uploadMutation.isPending}
            className="relative mr-4"
            testID="avatar-upload-button"
          >
            <View className="w-16 h-16 rounded-full overflow-hidden bg-white/20 items-center justify-center">
              {uploadMutation.isPending ? (
                <ActivityIndicator color="white" testID="upload-loading-indicator" />
              ) : avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={{ width: 64, height: 64 }}
                  resizeMode="cover"
                />
              ) : (
                <Text className="text-white text-2xl font-bold">
                  {user?.name?.[0]?.toUpperCase() ?? "?"}
                </Text>
              )}
            </View>
            {/* Camera badge */}
            <View
              className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-white items-center justify-center"
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.2,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
              }}
            >
              <Camera size={11} color="#4361EE" />
            </View>
          </TouchableOpacity>

          <View className="flex-1">
            <Text className="text-white text-xl font-bold">{user?.name}</Text>
            <Text className="text-white/70 text-sm">{user?.email}</Text>
            <Text className="text-white/50 text-xs mt-0.5">Tap photo to change</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Actions */}
      <View className="mx-4 mt-4 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden mb-4">
        <TouchableOpacity
          className="flex-row items-center px-4 py-4 border-b border-slate-100 dark:border-slate-700"
          onPress={() => router.push("/onboarding")}
          testID="create-join-team-button"
        >
          <Users size={20} color="#4361EE" />
          <Text className="flex-1 ml-3 text-slate-900 dark:text-white font-medium">
            Create or join team
          </Text>
          <ChevronRight size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <View className="mx-4 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
        <TouchableOpacity
          className="flex-row items-center px-4 py-4"
          onPress={handleSignOut}
          testID="sign-out-button"
        >
          <LogOut size={20} color="#EF4444" />
          <Text className="flex-1 ml-3 text-red-500 font-medium">Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
