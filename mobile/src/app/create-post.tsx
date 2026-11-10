import { useEffect, useRef, useState } from "react";
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
import { Images, X } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { pickMedia, type PickedFile } from "@/lib/file-picker";
import { uploadFile } from "@/lib/upload";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import { UserAvatar } from "@/components/UserAvatar";
import { PostMediaAttachment } from "@/components/PostMediaAttachment";
import { useStatusClusterInset } from "@/lib/adaptive-layout";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const BODY_MAX = 2000;

export default function CreatePostScreen() {
  const { teamId, scope, attach, draft } = useLocalSearchParams<{
    teamId?: string;
    scope?: "network";
    /** Set when the caller opened the media picker directly. */
    attach?: string;
    /** Opening line from a starter prompt, so the box is never blank. */
    draft?: string;
  }>();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const me = authReady?.me ?? session?.user;
  const isNetworkPost = scope === "network";
  const { access } = useWorkspaceAccess(isNetworkPost ? null : teamId);
  const workspaceWritable = isNetworkPost || access.canWrite;

  const [body, setBody] = useState(draft ?? "");
  const [media, setMedia] = useState<PickedFile | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!isNetworkPost && !teamId) throw new Error("No workspace selected");
      if (!workspaceWritable) throw new Error("This workspace is read-only.");
      let imageUrl: string | undefined;
      let imageWidth: number | undefined;
      let imageHeight: number | undefined;

      const mediaType = media?.mimeType.startsWith("video/")
        ? ("video" as const)
        : ("image" as const);

      if (media) {
        const uploaded = await uploadFile(
          media.uri,
          media.filename,
          media.mimeType,
          { purpose: "generic" },
        );
        imageUrl = uploaded.url;
        if (mediaType === "image" && size) {
          imageWidth = Math.round(size.width);
          imageHeight = Math.round(size.height);
        }
      }

      return api.post(
        isNetworkPost
          ? "/api/network-updates"
          : `/api/teams/${teamId}/activity/posts`,
        {
          body: body.trim() || undefined,
          imageUrl,
          imageWidth,
          imageHeight,
          mediaType: imageUrl ? mediaType : undefined,
        },
      );
    },
    onSuccess: async () => {
      if (isNetworkPost) {
        await queryClient.invalidateQueries({ queryKey: ["network-updates"] });
      } else {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["team-activity", teamId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["personal-recognitions"],
          }),
        ]);
      }
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
      const picked = await pickMedia();
      if (!picked) return;
      setMedia(picked);
      const measured = picked.mimeType.startsWith("image/")
        ? await Image.getSize(picked.uri).catch(() => null)
        : null;
      setSize(
        measured?.width && measured?.height
          ? { width: measured.width, height: measured.height }
          : null,
      );
    } catch (error) {
      Alert.alert(
        "Couldn't add that media",
        error instanceof Error ? error.message : "Try another photo or video.",
      );
    }
  };

  /** Opens the picker once, so returning from it does not reopen it. */
  const mediaRequested = useRef(false);
  useEffect(() => {
    if (attach !== "1" || mediaRequested.current) return;
    mediaRequested.current = true;
    void onAttach();
  }, [attach]);

  const canPost =
    workspaceWritable && (!!body.trim() || !!media) && !postMutation.isPending;
  const cluster = useStatusClusterInset({ fullScreen: true });

  return (
    <SafeAreaView
      style={[
        styles.page,
        { paddingLeft: cluster.left, paddingRight: cluster.right },
      ]}
      edges={["top"]}
    >
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
          onPress={() => {
            if (!workspaceWritable) return;
            postMutation.mutate();
          }}
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
            placeholder={
              isNetworkPost
                ? "Share an update with your network"
                : "Share an update with your workspace"
            }
            placeholderTextColor="#94A3B8"
            value={body}
            onChangeText={setBody}
            multiline
            autoFocus
            maxLength={BODY_MAX}
            style={styles.input}
            testID="create-post-input"
          />

          {media ? (
            <View style={styles.photoWrap}>
              <PostMediaAttachment
                url={media.uri}
                mediaType={
                  media.mimeType.startsWith("video/") ? "video" : "image"
                }
                width={size?.width}
                height={size?.height}
                testID={
                  media.mimeType.startsWith("video/")
                    ? "create-post-video"
                    : "create-post-photo"
                }
              />
              <Pressable
                onPress={() => {
                  setMedia(null);
                  setSize(null);
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Remove media"
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
            accessibilityLabel="Add a photo or video"
            testID="create-post-attach"
            style={styles.attach}
          >
            <Images size={21} color="#4361EE" strokeWidth={2.1} />
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
    paddingTop: 16,
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
    marginTop: 6,
    position: "relative",
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
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F3F6FF",
  },
});
