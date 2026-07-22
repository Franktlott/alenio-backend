import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  Modal,
  Pressable,
} from "react-native";
import { Camera, X } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import type { Team } from "@/lib/types";

type EditableWorkspace = Pick<Team, "id" | "name" | "image">;

type EditWorkspaceModalProps = {
  workspace: EditableWorkspace | null;
  visible: boolean;
  onClose: () => void;
};

export function EditWorkspaceModal({ workspace, visible, onClose }: EditWorkspaceModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!workspace || !visible) return;
    setName(workspace.name);
    setImage(workspace.image ?? null);
  }, [workspace, visible]);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; image: string | null }) =>
      api.patch<Team>(`/api/teams/${workspace!.id}`, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["team", updated.id] });
      toast({ title: "Workspace updated", preset: "done" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update workspace", preset: "error" }),
  });

  const pickPhoto = async () => {
    if (!workspace) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingImage(true);
    try {
      const uploaded = await uploadFile(result.assets[0].uri, "team-photo.jpg", "image/jpeg", {
        purpose: "team",
        teamId: workspace.id,
      });
      setImage(uploaded.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Failed to upload photo", message, preset: "error" });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = () => {
    if (!workspace || !name.trim()) return;
    updateMutation.mutate({ name: name.trim(), image });
  };

  return (
    <Modal visible={visible && !!workspace} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <SafeKeyboardAvoidingView>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View className="bg-white dark:bg-slate-800 rounded-t-3xl px-4 pt-4 pb-10">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-lg font-bold text-slate-900 dark:text-white">Edit Workspace</Text>
                <TouchableOpacity onPress={onClose} testID="close-edit-workspace-modal">
                  <X size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <View className="items-center mb-6">
                <TouchableOpacity onPress={pickPhoto} disabled={uploadingImage} testID="edit-workspace-pick-photo">
                  <View className="w-24 h-24 rounded-2xl bg-indigo-100 items-center justify-center overflow-hidden">
                    {uploadingImage ? (
                      <ActivityIndicator color="#4361EE" />
                    ) : image ? (
                      <Image source={{ uri: image }} style={{ width: 96, height: 96 }} resizeMode="cover" />
                    ) : (
                      <Text className="text-indigo-600 font-bold text-3xl">
                        {name?.[0]?.toUpperCase() ?? "W"}
                      </Text>
                    )}
                  </View>
                  <View
                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-indigo-600 items-center justify-center"
                    style={{
                      shadowColor: "#000",
                      shadowOpacity: 0.15,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 },
                    }}
                  >
                    <Camera size={14} color="white" />
                  </View>
                </TouchableOpacity>
                <Text className="text-xs text-slate-400 mt-2">Tap to change photo</Text>
              </View>

              <View className="mb-6">
                <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Workspace Name
                </Text>
                <TextInput
                  className="bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 text-base"
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter workspace name"
                  placeholderTextColor="#94A3B8"
                  testID="edit-workspace-name-input"
                  returnKeyType="done"
                />
              </View>

              <TouchableOpacity
                onPress={handleSave}
                disabled={updateMutation.isPending || !name.trim()}
                className="rounded-2xl py-4 items-center"
                style={{ backgroundColor: name.trim() ? "#4361EE" : "#CBD5E1" }}
                testID="save-workspace-button"
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </SafeKeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
