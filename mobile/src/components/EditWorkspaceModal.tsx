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
import { Camera, Settings2, Trash2, X } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { useTeamStore } from "@/lib/state/team-store";
import { applyTeamRemovedFromAccount } from "@/lib/workspace-switch";
import type { Team } from "@/lib/types";
import { WorkspacePhotoPlaceholder } from "@/components/WorkspacePhotoPlaceholder";
import { WorkplaceStandardsSheet } from "@/components/WorkplaceStandardsSheet";
import { mergeWorkplaceStandards, type WorkplaceStandards } from "@/lib/workplace-standards";

type EditableWorkspace = Pick<Team, "id" | "name" | "image" | "role">;

type EditWorkspaceModalProps = {
  workspace: EditableWorkspace | null;
  visible: boolean;
  onClose: () => void;
};

export function EditWorkspaceModal({ workspace, visible, onClose }: EditWorkspaceModalProps) {
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [standardsOpen, setStandardsOpen] = useState(false);

  const isOwner = (workspace?.role ?? "").trim().toLowerCase() === "owner";

  const { data: teamStandards } = useQuery({
    queryKey: ["team", workspace?.id, "workplaceStandards"],
    queryFn: async () => {
      const team = await api.get<Team & { workplaceStandards?: WorkplaceStandards }>(
        `/api/teams/${workspace!.id}`,
      );
      return mergeWorkplaceStandards(team.workplaceStandards);
    },
    enabled: !!workspace?.id && isOwner && (visible || standardsOpen),
  });

  useEffect(() => {
    if (!workspace || !visible) return;
    setName(workspace.name);
    setImage(workspace.image ?? null);
    setConfirmingDelete(false);
    setDeletePassword("");
    setStandardsOpen(false);
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

  const deleteMutation = useMutation({
    mutationFn: (body: { password: string }) => api.delete(`/api/teams/${workspace!.id}`, body),
    onSuccess: async () => {
      const deletedId = workspace!.id;
      onClose();
      await applyTeamRemovedFromAccount(deletedId, activeTeamId, setActiveTeamId, queryClient);
      toast({ title: "Workspace deleted", preset: "done" });
    },
    onError: (err: Error) => {
      const message =
        err.message === "Incorrect password" ? "Incorrect password. Please try again." : "Failed to delete workspace";
      toast({ title: message, preset: "error" });
    },
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

  const deleteReady = deletePassword.trim().length > 0;

  const handleDelete = () => {
    if (!workspace || !deleteReady) return;
    deleteMutation.mutate({ password: deletePassword.trim() });
  };

  const handleClose = () => {
    setConfirmingDelete(false);
    setDeletePassword("");
    onClose();
  };

  return (
    <>
      <Modal visible={visible && !!workspace && !standardsOpen} transparent animationType="slide" onRequestClose={handleClose}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={handleClose}>
          <SafeKeyboardAvoidingView>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View className="bg-white dark:bg-slate-800 rounded-t-3xl px-4 pt-4 pb-10">
                {!confirmingDelete ? (
                  <>
                    <View className="flex-row items-center justify-between mb-6">
                      <Text className="text-lg font-bold text-slate-900 dark:text-white">Edit Workspace</Text>
                      <View className="flex-row items-center" style={{ gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => setConfirmingDelete(true)}
                          hitSlop={8}
                          testID="delete-workspace-button"
                          accessibilityLabel="Delete workspace"
                        >
                          <Trash2 size={20} color="#EF4444" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleClose} testID="close-edit-workspace-modal">
                          <X size={20} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View className="items-center mb-6">
                      <TouchableOpacity onPress={pickPhoto} disabled={uploadingImage} testID="edit-workspace-pick-photo">
                        <View className="w-24 h-24 rounded-2xl items-center justify-center overflow-hidden">
                          {uploadingImage ? (
                            <View className="w-24 h-24 rounded-2xl bg-indigo-100 items-center justify-center">
                              <ActivityIndicator color="#4361EE" />
                            </View>
                          ) : image ? (
                            <Image source={{ uri: image }} style={{ width: 96, height: 96, borderRadius: 16 }} resizeMode="cover" />
                          ) : (
                            <WorkspacePhotoPlaceholder size={96} shape="rounded" testID="workspace-photo-placeholder" />
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

                    {isOwner ? (
                      <TouchableOpacity
                        onPress={() => setStandardsOpen(true)}
                        activeOpacity={0.7}
                        className="mb-4 rounded-2xl py-3.5 px-4 flex-row items-center justify-between border border-indigo-100"
                        style={{ backgroundColor: "#EEF2FF" }}
                        testID="edit-workspace-workplace-settings"
                        accessibilityRole="button"
                        accessibilityLabel="Workplace Settings"
                      >
                        <View className="flex-row items-center" style={{ gap: 10 }}>
                          <Settings2 size={18} color="#4361EE" />
                          <View>
                            <Text className="text-slate-900 dark:text-white font-semibold text-base">
                              Workplace Settings
                            </Text>
                            <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Check-ins, goals, and standards
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ) : null}

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
                  </>
                ) : (
                  <>
                    <View className="flex-row items-center justify-between mb-4">
                      <Text className="text-lg font-bold text-slate-900 dark:text-white">Delete Workspace?</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setConfirmingDelete(false);
                          setDeletePassword("");
                        }}
                        testID="back-from-delete-workspace"
                      >
                        <X size={20} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                    <Text className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      This will permanently delete{" "}
                      <Text className="font-semibold text-slate-700 dark:text-slate-200">{workspace?.name}</Text>
                      {" "}and all its tasks and messages. Members will keep their accounts.
                    </Text>
                    <Text className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                      Enter your account password to confirm.
                    </Text>
                    <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Your account password
                    </Text>
                    <TextInput
                      className="bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 text-base mb-4 border border-slate-200 dark:border-slate-600"
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                      placeholder="Password"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      testID="delete-workspace-password-input"
                    />
                    <TouchableOpacity
                      onPress={handleDelete}
                      disabled={deleteMutation.isPending || !deleteReady}
                      className="rounded-2xl py-4 items-center mb-3"
                      style={{ backgroundColor: deleteReady ? "#EF4444" : "#CBD5E1" }}
                      testID="confirm-delete-workspace"
                    >
                      {deleteMutation.isPending ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="text-white font-bold text-base">Delete Forever</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setConfirmingDelete(false);
                        setDeletePassword("");
                      }}
                      className="rounded-2xl py-4 items-center bg-slate-100 dark:bg-slate-700"
                      testID="cancel-delete-workspace"
                    >
                      <Text className="text-slate-700 dark:text-slate-200 font-semibold text-base">Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Pressable>
          </SafeKeyboardAvoidingView>
        </Pressable>
      </Modal>

      {isOwner && workspace ? (
        <WorkplaceStandardsSheet
          visible={standardsOpen}
          teamId={workspace.id}
          initialStandards={teamStandards ?? mergeWorkplaceStandards(undefined)}
          onClose={() => setStandardsOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["team", workspace.id] });
            queryClient.invalidateQueries({ queryKey: ["team", workspace.id, "workplaceStandards"] });
            queryClient.invalidateQueries({ queryKey: ["member-stats", workspace.id] });
          }}
        />
      ) : null}
    </>
  );
}
