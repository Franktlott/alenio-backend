import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
  ScrollView,
} from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Hash, Plus, Camera, X } from "lucide-react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useUnreadStore } from "@/lib/state/unread-store";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { uploadFile } from "@/lib/upload";
import { SpaceAvatar } from "@/components/SpaceAvatar";

export type SpaceTopic = {
  id: string;
  name: string;
  color: string;
  image?: string | null;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastMessage?: {
    id: string;
    content: string | null;
    mediaType?: string | null;
    createdAt: string;
    sender: { id: string; name: string | null };
  } | null;
};

type Props = {
  teamId: string;
  teamName: string;
  canManage: boolean;
  cardStyle: object;
  compactEmpty?: boolean;
  /** When true, fills parent height and scrolls the list independently. */
  fillHeight?: boolean;
};

function topicActivityTime(topic: SpaceTopic): number {
  const raw = topic.lastMessage?.createdAt ?? topic.updatedAt ?? topic.createdAt ?? "";
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function SpacesSection({
  teamId,
  teamName,
  canManage,
  cardStyle,
  compactEmpty = false,
  fillHeight = false,
}: Props) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newImage, setNewImage] = useState<string | null>(null);
  const [uploadingCreateImage, setUploadingCreateImage] = useState(false);
  const [actionTopic, setActionTopic] = useState<SpaceTopic | null>(null);
  const [editTopic, setEditTopic] = useState<SpaceTopic | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editImage, setEditImage] = useState<string | null>(null);
  const [uploadingEditImage, setUploadingEditImage] = useState(false);
  const [deleteTopic, setDeleteTopic] = useState<SpaceTopic | null>(null);

  const { data: topics = [], isLoading } = useQuery<SpaceTopic[]>({
    queryKey: ["topics", teamId],
    queryFn: () => api.get<SpaceTopic[]>(`/api/teams/${teamId}/topics`),
    enabled: !!teamId,
    refetchInterval: 10000,
  });

  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const topicLastReadIds = Object.fromEntries(
    topics.map((t) => [`topic:${t.id}`, lastReadIds[`topic:${t.id}`] ?? ""])
  );
  const { data: unreadCounts = {} } = useQuery({
    queryKey: ["team-unread-counts", teamId, "spaces", topicLastReadIds],
    queryFn: () =>
      api.post<Record<string, number>>(`/api/teams/${teamId}/messages/unread-counts`, {
        lastReadIds: topicLastReadIds,
      }),
    enabled: !!teamId && !!session?.user && topics.length > 0,
    refetchInterval: 5000,
    staleTime: 0,
  });

  const pickSpacePhoto = async (onPicked: (url: string) => void, setUploading: (v: boolean) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0] || !teamId) return;
    setUploading(true);
    try {
      // Use generic upload — do not use purpose "team" (that replaces the workspace photo).
      const uploaded = await uploadFile(result.assets[0].uri, "space-photo.jpg", "image/jpeg");
      onPicked(uploaded.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      Alert.alert("Failed to upload photo", message);
    } finally {
      setUploading(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: ({ name, description, image }: { name: string; description: string; image: string | null }) =>
      api.post(`/api/teams/${teamId}/topics`, { name, description, image }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", teamId] });
      setShowCreate(false);
      setNewName("");
      setNewDescription("");
      setNewImage(null);
      toast({ title: "Space created", preset: "done" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, description, image }: { id: string; name: string; description: string; image: string | null }) =>
      api.patch(`/api/teams/${teamId}/topics/${id}`, { name, description, image }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", teamId] });
      setEditTopic(null);
      toast({ title: "Space updated", preset: "done" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/teams/${teamId}/topics/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", teamId] });
      setDeleteTopic(null);
      toast({ title: "Space deleted", preset: "done" });
    },
  });

  const sortedTopics = [...topics].sort((a, b) => topicActivityTime(b) - topicActivityTime(a));

  const header = (
    <View
      style={{
        marginHorizontal: 14,
        marginTop: fillHeight ? 4 : compactEmpty ? 6 : 12,
        marginBottom: 6,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 12,
        flexShrink: 0,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: "#64748B",
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          Spaces
        </Text>
        <Text style={{ fontSize: 12, color: "#94A3B8", lineHeight: 16 }} numberOfLines={1}>
          {topics.length === 0
            ? "Shared channels for projects and topics"
            : `${topics.length} active space${topics.length === 1 ? "" : "s"}`}
        </Text>
      </View>
      {canManage ? (
        <Pressable
          testID="create-space-button"
          onPress={() => setShowCreate(true)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#E2E8F0",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus size={15} color="#0F172A" />
        </Pressable>
      ) : null}
    </View>
  );

  const listBody = isLoading ? (
    <View style={{ paddingVertical: 16, alignItems: "center" }}>
      <ActivityIndicator color="#4361EE" />
    </View>
  ) : topics.length === 0 ? (
    <View
      testID="spaces-empty-state"
      style={[
        cardStyle,
        {
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: compactEmpty ? 10 : 14,
          paddingHorizontal: 12,
          marginBottom: 4,
          ...(fillHeight ? { flex: 1, minHeight: 0 } : null),
        },
      ]}
    >
      <Image
        source={require("@/assets/messages-empty-team.png")}
        style={{
          width: compactEmpty ? 52 : 80,
          height: compactEmpty ? 52 : 80,
          marginBottom: compactEmpty ? 2 : 4,
        }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text
        style={{
          fontSize: compactEmpty ? 14 : 16,
          fontWeight: "800",
          color: "#0F172A",
          textAlign: "center",
          letterSpacing: -0.3,
          lineHeight: compactEmpty ? 18 : 22,
          marginBottom: 2,
          maxWidth: 300,
        }}
      >
        Give every topic <Text style={{ color: "#7C3AED" }}>its own space.</Text>
      </Text>
      <Text
        style={{
          fontSize: compactEmpty ? 11 : 12,
          color: "#64748B",
          textAlign: "center",
          lineHeight: compactEmpty ? 15 : 17,
          maxWidth: 280,
          marginBottom: canManage ? (compactEmpty ? 8 : 10) : 0,
        }}
        numberOfLines={2}
      >
        Create channels for shifts, projects, or announcements.
      </Text>
      {canManage ? (
        <Pressable
          testID="spaces-empty-create"
          onPress={() => setShowCreate(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            backgroundColor: "#4361EE",
            borderRadius: 9,
            paddingHorizontal: 14,
            paddingVertical: compactEmpty ? 7 : 9,
            width: "100%",
            maxWidth: 240,
          }}
          accessibilityRole="button"
          accessibilityLabel="Create space"
        >
          <Plus size={14} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontSize: compactEmpty ? 12 : 13, fontWeight: "700" }}>
            Create space
          </Text>
        </Pressable>
      ) : null}
    </View>
  ) : (
    sortedTopics.map((topic) => {
      const unread = unreadCounts[`topic:${topic.id}`] ?? 0;
      return (
        <Pressable
          key={topic.id}
          testID={`space-card-${topic.id}`}
          onPress={() =>
            router.push({
              pathname: "/team-chat",
              params: {
                teamId,
                topicId: topic.id,
                topicName: topic.name,
                topicImage: topic.image ?? "",
                teamName,
              },
            })
          }
          onLongPress={
            canManage
              ? () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setActionTopic(topic);
                }
              : undefined
          }
          delayLongPress={350}
          style={cardStyle}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <SpaceAvatar name={topic.name} image={topic.image} color={topic.color} size={40} radius={12} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", flexShrink: 1 }} numberOfLines={1}>
                  {topic.name}
                </Text>
                {unread > 0 ? (
                  <View
                    style={{
                      backgroundColor: "#EF4444",
                      borderRadius: 9,
                      minWidth: 18,
                      height: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 5,
                      flexShrink: 0,
                    }}
                  >
                    <Text style={{ color: "white", fontSize: 10, fontWeight: "700" }}>{unread}</Text>
                  </View>
                ) : topic.description ? (
                  <View
                    style={{
                      backgroundColor: "#F1F5F9",
                      borderRadius: 7,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      maxWidth: "42%",
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#64748B" }} numberOfLines={1}>
                      {topic.description}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }} numberOfLines={1}>
                {topic.lastMessage
                  ? `${topic.lastMessage.sender.name ?? "Someone"}: ${topic.lastMessage.content ?? "Attachment"}`
                  : "No posts yet"}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    })
  );

  return (
    <View style={fillHeight ? { flex: 1, minHeight: 0 } : undefined}>
      {header}
      {fillHeight && topics.length === 0 && !isLoading ? (
        <View style={{ flex: 1, minHeight: 0, paddingBottom: 4 }}>{listBody}</View>
      ) : fillHeight ? (
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {listBody}
        </ScrollView>
      ) : (
        listBody
      )}

      <Modal visible={!!actionTopic && canManage} transparent animationType="slide" onRequestClose={() => setActionTopic(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setActionTopic(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", marginBottom: 16 }}>#{actionTopic?.name}</Text>
              <Pressable
                testID="action-edit-space"
                onPress={() => {
                  if (actionTopic) {
                    setEditName(actionTopic.name);
                    setEditDescription(actionTopic.description ?? "");
                    setEditImage(actionTopic.image ?? null);
                    setEditTopic(actionTopic);
                  }
                  setActionTopic(null);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: "#F1F5F9" }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                  <Hash size={18} color="#4361EE" />
                </View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>Edit space</Text>
              </Pressable>
              <Pressable
                testID="action-delete-space"
                onPress={() => {
                  setDeleteTopic(actionTopic);
                  setActionTopic(null);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: "#F1F5F9" }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 18 }}>🗑</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#EF4444" }}>Delete space</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!editTopic && canManage} transparent animationType="slide" onRequestClose={() => setEditTopic(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setEditTopic(null)}>
          <SafeKeyboardAvoidingView>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 16 }}>Edit Space</Text>
                <View style={{ alignItems: "center", marginBottom: 18 }}>
                  <Pressable
                    onPress={() => pickSpacePhoto(setEditImage, setUploadingEditImage)}
                    disabled={uploadingEditImage}
                    testID="edit-space-photo-button"
                    style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                  >
                    {uploadingEditImage ? (
                      <ActivityIndicator color="#4361EE" />
                    ) : editImage ? (
                      <SpaceAvatar name={editName || editTopic?.name || "Space"} image={editImage} size={72} radius={20} />
                    ) : (
                      <Camera size={26} color="#4361EE" />
                    )}
                  </Pressable>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
                    <Pressable onPress={() => pickSpacePhoto(setEditImage, setUploadingEditImage)} disabled={uploadingEditImage}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#4361EE" }}>{editImage ? "Change photo" : "Add photo"}</Text>
                    </Pressable>
                    {editImage ? (
                      <Pressable onPress={() => setEditImage(null)} testID="edit-space-remove-photo" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <X size={12} color="#94A3B8" />
                        <Text style={{ fontSize: 13, fontWeight: "500", color: "#94A3B8" }}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Space name..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 14 }}
                  testID="edit-space-name-input"
                />
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Description</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Short description (optional)..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 20 }}
                  testID="edit-space-description-input"
                />
                <Pressable
                  onPress={() => {
                    if (editTopic && editName.trim()) {
                      updateMutation.mutate({
                        id: editTopic.id,
                        name: editName.trim(),
                        description: editDescription.trim(),
                        image: editImage,
                      });
                    }
                  }}
                  disabled={!editName.trim() || updateMutation.isPending || uploadingEditImage}
                  style={{ height: 48, borderRadius: 14, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center", opacity: !editName.trim() || uploadingEditImage ? 0.5 : 1 }}
                  testID="edit-space-submit"
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Save Changes</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </SafeKeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={!!deleteTopic && canManage} transparent animationType="fade" onRequestClose={() => setDeleteTopic(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }} onPress={() => setDeleteTopic(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", backgroundColor: "white", borderRadius: 20, overflow: "hidden" }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: "center" }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 20 }}>🗑</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 6 }}>Delete space?</Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}>
                Delete <Text style={{ fontWeight: "700" }}>#{deleteTopic?.name}</Text>? All messages will be permanently removed.
              </Text>
            </View>
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
              <Pressable onPress={() => setDeleteTopic(null)} style={{ flex: 1, paddingVertical: 14, alignItems: "center", borderRightWidth: 1, borderRightColor: "#F1F5F9" }} testID="cancel-delete-space">
                <Text style={{ fontSize: 15, fontWeight: "500", color: "#64748B" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (deleteTopic) deleteMutation.mutate(deleteTopic.id);
                }}
                disabled={deleteMutation.isPending}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}
                testID="confirm-delete-space"
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#EF4444" }}>Delete</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowCreate(false)}>
          <SafeKeyboardAvoidingView>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 16 }}>New Space</Text>
                <View style={{ alignItems: "center", marginBottom: 18 }}>
                  <Pressable
                    onPress={() => pickSpacePhoto(setNewImage, setUploadingCreateImage)}
                    disabled={uploadingCreateImage}
                    testID="create-space-photo-button"
                    style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                  >
                    {uploadingCreateImage ? (
                      <ActivityIndicator color="#4361EE" />
                    ) : newImage ? (
                      <SpaceAvatar name={newName || "Space"} image={newImage} size={72} radius={20} />
                    ) : (
                      <Camera size={26} color="#4361EE" />
                    )}
                  </Pressable>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
                    <Pressable onPress={() => pickSpacePhoto(setNewImage, setUploadingCreateImage)} disabled={uploadingCreateImage}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#4361EE" }}>{newImage ? "Change photo" : "Add photo"}</Text>
                    </Pressable>
                    {newImage ? (
                      <Pressable onPress={() => setNewImage(null)} testID="create-space-remove-photo" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <X size={12} color="#94A3B8" />
                        <Text style={{ fontSize: 13, fontWeight: "500", color: "#94A3B8" }}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Space name..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 16 }}
                  testID="space-name-input"
                  autoFocus
                />
                <TextInput
                  value={newDescription}
                  onChangeText={setNewDescription}
                  placeholder="Short description (optional)..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 20 }}
                  testID="space-description-input"
                />
                <Pressable
                  onPress={() => {
                    if (newName.trim()) {
                      createMutation.mutate({
                        name: newName.trim(),
                        description: newDescription.trim(),
                        image: newImage,
                      });
                    }
                  }}
                  disabled={!newName.trim() || createMutation.isPending || uploadingCreateImage}
                  style={{ height: 48, borderRadius: 14, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center", opacity: !newName.trim() || uploadingCreateImage ? 0.5 : 1 }}
                  testID="create-space-submit"
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Create Space</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </SafeKeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
