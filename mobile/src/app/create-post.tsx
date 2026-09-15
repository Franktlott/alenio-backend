import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ImagePlus, X } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { pickAttachmentImage, type PickedFile } from "@/lib/file-picker";
import { uploadFile } from "@/lib/upload";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import { UserAvatar } from "@/components/UserAvatar";

const BODY_MAX = 2000;

export default function CreatePostScreen() {
  const { teamId } = useLocalSearchParams<{ teamId?: string }>();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const me = authReady?.me ?? session?.user;

  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const ratio = size ? size.width / size.height : 4 / 3;

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!teamId) throw new Error("No workspace selected");
      let imageUrl: string | undefined;
      let imageWidth: number | undefined;
      let imageHeight: number | undefined;

      if (photo) {
        const uploaded = await uploadFile(
          photo.uri,
          photo.filename,
          photo.mimeType,
          { purpose: "team", teamId },
        );
        imageUrl = uploaded.url;
        if (size) {
          imageWidth = Math.round(size.width);
          imageHeight = Math.round(size.height);
        }
      }

      return api.post(`/api/teams/${teamId}/activity/posts`, {
        body: body.trim() || undefined,
        imageUrl,
        imageWidth,
        imageHeight,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team-activity", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["personal-recognitions"] }),
      ]);
      router.back();
    },
    onError: (error) => {
      Alert.alert(
        "Post not shared",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    },
  });

  const onAttach = async () => {
    try {
      const picked = await pickAttachmentImage();
      if (!picked) return;
      setPhoto(picked);
      const measured = await Image.getSize(picked.uri).catch(() => null);
      setSize(
        measured?.width && measured?.height
          ? { width: measured.width, height: measured.height }
          : null,
      );
    } catch (error) {
      Alert.alert(
        "Couldn't add that photo",
        error instanceof Error ? error.message : "Try another photo.",
      );
    }
  };

  const canPost = (!!body.trim() || !!photo) && !postMutation.isPending;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          testID="create-post-cancel"
        >
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.navTitle}>New post</Text>
        <Pressable
          onPress={() => postMutation.mutate()}
          disabled={!canPost}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Share post"
          testID="create-post-submit"
          style={[styles.postBtn, canPost ? null : styles.postBtnDisabled]}
        >
          {postMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </Pressable>
      </View>

      <SafeKeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authorRow}>
            <UserAvatar
              user={{ name: me?.name ?? "You", image: me?.image ?? null }}
              size={38}
              radius={19}
              backgroundColor="#EEF2FF"
              textColor="#4361EE"
              fontSize={15}
              workplaceConnected={false}
            />
            <Text style={styles.authorName} numberOfLines={1}>
              {me?.name ?? "You"}
            </Text>
          </View>

          <TextInput
            placeholder="Share an update with your workspace"
            placeholderTextColor="#94A3B8"
            value={body}
            onChangeText={setBody}
            multiline
            autoFocus
            maxLength={BODY_MAX}
            style={styles.input}
            testID="create-post-input"
          />

          {photo ? (
            <View style={styles.photoWrap}>
              <Image
                source={{ uri: photo.uri }}
                style={[styles.photo, { aspectRatio: ratio }]}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                testID="create-post-photo"
              />
              <Pressable
                onPress={() => {
                  setPhoto(null);
                  setSize(null);
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                testID="create-post-remove-photo"
                style={styles.removePhoto}
              >
                <X size={16} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.toolbar}>
          <Pressable
            onPress={onAttach}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            testID="create-post-attach"
            style={styles.attach}
          >
            <ImagePlus size={19} color="#4361EE" strokeWidth={2.1} />
            <Text style={styles.attachText}>
              {photo ? "Replace photo" : "Add photo"}
            </Text>
          </Pressable>
        </View>
      </SafeKeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  flex: {
    flex: 1,
    minHeight: 0,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F6",
  },
  cancel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  postBtn: {
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#4361EE",
  },
  postBtnDisabled: {
    opacity: 0.4,
  },
  postBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  body: {
    padding: 16,
    paddingBottom: 24,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  authorName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  input: {
    minHeight: 120,
    fontSize: 16,
    lineHeight: 23,
    color: "#0F172A",
    textAlignVertical: "top",
  },
  photoWrap: {
    marginTop: 14,
    position: "relative",
  },
  photo: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#EEF1F6",
  },
  removePhoto: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.6)",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF1F6",
  },
  attach: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F3F6FF",
  },
  attachText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4361EE",
  },
});
