import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  Building2,
  ChevronDown,
  Images,
  Lock,
  Users,
  X,
} from "lucide-react-native";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { pickMedia, type PickedFile } from "@/lib/file-picker";
import { uploadFile } from "@/lib/upload";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { useMobileAuthReady, useSession } from "@/lib/auth/use-session";
import { UserAvatar } from "@/components/UserAvatar";
import { PostMediaAttachment } from "@/components/PostMediaAttachment";
import {
  AlenioBottomSheet,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { useStatusClusterInset } from "@/lib/adaptive-layout";
import {
  deriveWorkspaceAccess,
  useWorkspaceAccess,
  type WorkspaceSubscription,
} from "@/lib/workspace-access";
import {
  buildPostAudienceOptions,
  postAudienceFromParams,
  postAudienceKey,
  postDestinationConfirmCopy,
  postDestinationSummary,
  resolvePostAudience,
  type PostAudience,
} from "@/lib/post-audience";
import {
  workspacePlanHref,
} from "@/lib/plan-access-copy";
import type { ConnectionsResponse, Team } from "@/lib/types";
import { colors } from "@/theme";

const BODY_MAX = 2000;

export default function CreatePostScreen() {
  const { teamId, scope, attach, draft } = useLocalSearchParams<{
    teamId?: string;
    scope?: "network";
    attach?: string;
    draft?: string;
  }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const me = authReady?.me ?? session?.user;

  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    staleTime: 60_000,
  });
  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
    staleTime: 60_000,
  });

  const teams = teamsQuery.data ?? [];
  const networkCount = connectionsQuery.data?.accepted.length ?? null;
  const initialAudience = useMemo(() => {
    const fromParams = postAudienceFromParams({ scope, teamId });
    if (fromParams?.kind === "workspace" && fromParams.teamId) {
      const team = teams.find((item) => item.id === fromParams.teamId);
      return {
        ...fromParams,
        teamName: team?.name ?? fromParams.teamName,
      };
    }
    if (fromParams) return fromParams;
    if (teams[0]) {
      return {
        kind: "workspace" as const,
        teamId: teams[0].id,
        teamName: teams[0].name,
      };
    }
    return { kind: "network" as const };
  }, [scope, teamId, teams]);

  const [audience, setAudience] = useState<PostAudience>(initialAudience);
  const [audienceReady, setAudienceReady] = useState(false);
  useEffect(() => {
    if (audienceReady) return;
    if (teamsQuery.isLoading && !teamsQuery.data) return;
    setAudience(initialAudience);
    setAudienceReady(true);
  }, [audienceReady, initialAudience, teamsQuery.data, teamsQuery.isLoading]);

  const selectedTeamId =
    audience.kind === "workspace" ? audience.teamId ?? null : null;
  const selectedTeam = selectedTeamId
    ? teams.find((team) => team.id === selectedTeamId) ?? null
    : null;
  const { access } = useWorkspaceAccess(selectedTeamId);

  /** Prefetch write access for every workspace so the picker can label them. */
  const teamAccessQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["subscription", team.id] as const,
      queryFn: () =>
        api.get<WorkspaceSubscription>(`/api/teams/${team.id}/subscription`),
      staleTime: 30_000,
    })),
  });
  const readOnlyTeamIds = useMemo(() => {
    const ids = new Set<string>();
    teams.forEach((team, index) => {
      const sub = teamAccessQueries[index]?.data;
      if (!sub) return;
      if (!deriveWorkspaceAccess(sub).canWrite) ids.add(team.id);
    });
    // Keep selected team in sync even before its list query settles.
    if (
      selectedTeamId &&
      audience.kind === "workspace" &&
      access.canWrite === false
    ) {
      ids.add(selectedTeamId);
    }
    return ids;
  }, [access.canWrite, audience.kind, selectedTeamId, teamAccessQueries, teams]);

  const workspaceReadOnly =
    audience.kind === "workspace" &&
    !!selectedTeamId &&
    readOnlyTeamIds.has(selectedTeamId);
  const workspaceWritable = !workspaceReadOnly;
  const canManagePlan = selectedTeam?.role === "owner";

  const [body, setBody] = useState(draft ?? "");
  const [media, setMedia] = useState<PickedFile | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const options = useMemo(
    () =>
      buildPostAudienceOptions({
        teams: teams.map((team) => ({ id: team.id, name: team.name })),
        networkConnectionCount: networkCount,
      }),
    [teams, networkCount],
  );

  const destination = postDestinationSummary(audience, networkCount);
  const confirmCopy = postDestinationConfirmCopy(audience, networkCount);

  const postMutation = useMutation({
    mutationFn: async () => {
      if (audience.kind === "workspace" && !audience.teamId) {
        throw new Error("Choose a workspace");
      }
      if (audience.kind === "workspace" && !workspaceWritable) {
        throw new Error("This workspace is read-only.");
      }
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

      const payload = {
        body: body.trim() || undefined,
        imageUrl,
        imageWidth,
        imageHeight,
        mediaType: imageUrl ? mediaType : undefined,
      };

      if (audience.kind === "network") {
        return api.post("/api/network-updates", payload);
      }
      return api.post(
        `/api/teams/${audience.teamId}/activity/posts`,
        payload,
      );
    },
    onSuccess: async () => {
      setConfirmOpen(false);
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: ["personal-feed"] }),
      ];
      if (audience.kind === "network") {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: ["network-updates"] }),
        );
      } else {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: ["team-activity", audience.teamId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["personal-recognitions"],
          }),
        );
      }
      await Promise.all(invalidations);
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

  const mediaRequested = useRef(false);
  useEffect(() => {
    if (attach !== "1" || mediaRequested.current) return;
    mediaRequested.current = true;
    void onAttach();
  }, [attach]);

  const canPost =
    workspaceWritable &&
    audienceReady &&
    (audience.kind === "network" || !!audience.teamId) &&
    (!!body.trim() || !!media) &&
    !postMutation.isPending;
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
            if (!canPost) return;
            setConfirmOpen(true);
          }}
          disabled={!canPost}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Review post destination"
          testID="create-post-submit"
          style={[styles.postBtn, canPost ? null : styles.postBtnDisabled]}
        >
          <Text style={styles.postBtnText}>Post</Text>
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
            <View style={styles.authorMeta}>
              <Text style={styles.authorName} numberOfLines={1}>
                {me?.name ?? "You"}
              </Text>
              <Pressable
                onPress={() => setPickerOpen(true)}
                style={styles.destinationChip}
                accessibilityRole="button"
                accessibilityLabel={`Posting to ${destination.title}. Change audience`}
                testID="create-post-audience-chip"
              >
                {audience.kind === "network" ? (
                  <Users size={13} color={colors.brand} strokeWidth={2.2} />
                ) : (
                  <Building2 size={13} color={colors.brand} strokeWidth={2.2} />
                )}
                <Text style={styles.destinationChipText} numberOfLines={1}>
                  {destination.title}
                </Text>
                <ChevronDown size={14} color={colors.brand} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          <Text style={styles.destinationHint} testID="create-post-audience-hint">
            Posting to {destination.title}
            {destination.detail ? ` · ${destination.detail}` : ""}
          </Text>

          {workspaceReadOnly ? (
            <View
              style={styles.readOnlyCard}
              testID="create-post-read-only-note"
            >
              <View style={styles.readOnlyHeader}>
                <Lock size={16} color="#98A2B3" strokeWidth={2.2} />
                <Text style={styles.readOnlyTitle}>Workspace is read-only</Text>
              </View>
              <Text style={styles.readOnlyBody}>
                {canManagePlan
                  ? "Choose a plan to restore full workspace functionality, including posting updates."
                  : "Posting to this workspace is currently unavailable. Contact your workspace owner to restore full access."}
              </Text>
              {canManagePlan && selectedTeamId ? (
                <Pressable
                  onPress={() => router.push(workspacePlanHref(selectedTeamId))}
                  style={[
                    alenioSheetStyles.primaryButton,
                    { backgroundColor: colors.brand, marginTop: 12 },
                  ]}
                  testID="create-post-choose-plan"
                  accessibilityRole="button"
                >
                  <Text style={alenioSheetStyles.primaryButtonText}>
                    Choose a plan
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <TextInput
            placeholder={
              audience.kind === "network"
                ? "Share an update with your network"
                : workspaceReadOnly
                  ? "Switch audience to post, or restore workspace access"
                  : "Share an update with your workspace"
            }
            placeholderTextColor="#94A3B8"
            value={body}
            onChangeText={setBody}
            multiline
            autoFocus={!workspaceReadOnly}
            maxLength={BODY_MAX}
            style={styles.input}
            testID="create-post-input"
            editable={!workspaceReadOnly}
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

        <View
          style={[
            styles.toolbar,
            { paddingBottom: Math.max(insets.bottom, 10) + 6 },
          ]}
        >
          <Pressable
            onPress={() => {
              if (workspaceReadOnly) return;
              void onAttach();
            }}
            disabled={workspaceReadOnly}
            accessibilityRole="button"
            accessibilityLabel="Add a photo or video"
            testID="create-post-attach"
            style={[styles.attach, workspaceReadOnly ? styles.attachDisabled : null]}
          >
            <Images
              size={21}
              color={workspaceReadOnly ? "#94A3B8" : "#4361EE"}
              strokeWidth={2.1}
            />
          </Pressable>
        </View>
      </SafeKeyboardAvoidingView>

      <AlenioBottomSheet
        visible={pickerOpen}
        title="Who should see this?"
        subtitle="Pick an audience for this update"
        onClose={() => setPickerOpen(false)}
        compact
        scrollEnabled={options.length > 6}
        bodyMaxHeight={options.length > 6 ? 340 : 280}
        testID="create-post-audience-sheet"
      >
        <View style={styles.audienceList}>
          {options.map((option, index) => {
            const selected = postAudienceKey(audience) === option.key;
            const optionReadOnly =
              option.kind === "workspace" &&
              !!option.teamId &&
              readOnlyTeamIds.has(option.teamId);
            const showSection =
              index === 0 ||
              options[index - 1]?.kind !== option.kind;
            return (
              <View key={option.key}>
                {showSection ? (
                  <Text style={styles.audienceSection}>
                    {option.kind === "network" ? "Network" : "Workspaces"}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => {
                    setAudience(resolvePostAudience(option, teams));
                    setPickerOpen(false);
                  }}
                  style={[
                    styles.audienceRow,
                    selected ? styles.audienceRowSelected : null,
                    index < options.length - 1 &&
                    options[index + 1]?.kind === option.kind
                      ? styles.audienceRowDivider
                      : null,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  testID={`create-post-audience-${option.key}`}
                >
                  <View
                    style={[
                      styles.audienceIcon,
                      selected ? styles.audienceIconSelected : null,
                    ]}
                  >
                    {option.kind === "network" ? (
                      <Users
                        size={15}
                        color={selected ? colors.brand : "#64748B"}
                        strokeWidth={2.2}
                      />
                    ) : (
                      <Building2
                        size={15}
                        color={selected ? colors.brand : "#64748B"}
                        strokeWidth={2.2}
                      />
                    )}
                  </View>
                  <View style={styles.audienceCopy}>
                    <Text
                      style={[
                        styles.audienceTitle,
                        selected ? styles.audienceTitleSelected : null,
                      ]}
                      numberOfLines={1}
                    >
                      {option.title}
                    </Text>
                    <Text style={styles.audienceSub} numberOfLines={1}>
                      {optionReadOnly
                        ? "Read-only — posting unavailable"
                        : option.subtitle}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.audienceRadio,
                      selected ? styles.audienceRadioSelected : null,
                    ]}
                  >
                    {selected ? <View style={styles.audienceRadioDot} /> : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={confirmOpen}
        title={confirmCopy.title}
        subtitle={confirmCopy.body}
        onClose={
          postMutation.isPending ? () => undefined : () => setConfirmOpen(false)
        }
        compact
        scrollEnabled={false}
        testID="create-post-confirm-sheet"
        footer={
          <>
            <Pressable
              onPress={() => postMutation.mutate()}
              disabled={postMutation.isPending}
              style={[
                alenioSheetStyles.primaryButton,
                postMutation.isPending
                  ? alenioSheetStyles.primaryButtonDisabled
                  : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Confirm and post"
              testID="create-post-confirm"
            >
              {postMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  Post to {destination.title}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setConfirmOpen(false)}
              disabled={postMutation.isPending}
              style={alenioSheetStyles.cancelButton}
              accessibilityRole="button"
              testID="create-post-confirm-cancel"
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </>
        }
      >
        <View style={styles.confirmCard}>
          <Text style={styles.confirmLabel}>Destination</Text>
          <Text style={styles.confirmTitle}>{destination.title}</Text>
          <Text style={styles.confirmDetail}>{destination.detail}</Text>
        </View>
      </AlenioBottomSheet>
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
    backgroundColor: colors.brand,
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
    marginBottom: 8,
  },
  authorMeta: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  authorName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  destinationChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EFE9FF",
  },
  destinationChipText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand,
  },
  destinationHint: {
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 16,
    color: "#64748B",
  },
  readOnlyCard: {
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E4F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  readOnlyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  readOnlyTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  readOnlyBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
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
    paddingTop: 10,
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
  attachDisabled: {
    backgroundColor: "#F1F5F9",
  },
  audienceList: {
    borderRadius: 14,
    backgroundColor: "#F7F8FA",
    overflow: "hidden",
  },
  audienceSection: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "#8A94A6",
  },
  audienceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 54,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#F7F8FA",
  },
  audienceRowSelected: {
    backgroundColor: "#F1EEFF",
  },
  audienceRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E4E7EC",
  },
  audienceIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  audienceIconSelected: {
    backgroundColor: "#E8E2FF",
  },
  audienceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  audienceTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#0F172A",
  },
  audienceTitleSelected: {
    color: colors.brand,
  },
  audienceSub: {
    fontSize: 12,
    lineHeight: 16,
    color: "#8A94A6",
  },
  audienceRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#C5CBD6",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  audienceRadioSelected: {
    borderColor: colors.brand,
  },
  audienceRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
  },
  confirmCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    gap: 4,
  },
  confirmLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  confirmDetail: {
    fontSize: 13,
    color: "#64748B",
  },
});
