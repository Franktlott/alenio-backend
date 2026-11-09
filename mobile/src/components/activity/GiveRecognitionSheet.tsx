import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Search, X } from "lucide-react-native";
import { toast } from "burnt";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import type {
  ConnectionsResponse,
  CreatePersonalRecognitionRequest,
  CreatePersonalRecognitionResponse,
  Team,
} from "@/lib/types";
import { CelebrationTypePickerCards } from "./CelebrationTypePickerCards";
import {
  CELEBRATION_TYPE_KEYS,
  type CelebrationTypeKey,
} from "./celebration-themes";

type RecognitionMember = {
  userId: string;
  user: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
  };
};

export function GiveRecognitionSheet({
  visible,
  onClose,
  workspaceTeamId,
}: {
  visible: boolean;
  onClose: () => void;
  workspaceTeamId?: string | null;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const [step, setStep] = useState<1 | 2>(1);
  const [target, setTarget] = useState<RecognitionMember["user"] | null>(null);
  const [recognitionType, setRecognitionType] = useState<CelebrationTypeKey>(
    CELEBRATION_TYPE_KEYS[0]!,
  );
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const { height: windowHeight } = useWindowDimensions();
  /** The sheet stays a comfortable height; a larger team scrolls inside it. */
  const listMaxHeight = Math.min(440, Math.round(windowHeight * 0.48));

  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
    enabled: visible && !workspaceTeamId,
  });
  const teamQuery = useQuery({
    queryKey: ["team", workspaceTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${workspaceTeamId}`),
    enabled: visible && !!workspaceTeamId,
  });

  const members = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const source: RecognitionMember[] = workspaceTeamId
      ? (teamQuery.data?.members ?? [])
          .filter((member) => member.userId !== currentUserId)
          .map((member) => ({
            userId: member.userId,
            user: {
              id: member.user.id,
              name:
                member.user.name || member.user.username || "Alenio member",
              username: member.user.username ?? null,
              image: member.user.image ?? null,
            },
          }))
      : (connectionsQuery.data?.accepted ?? []).map((connection) => ({
          userId: connection.person.id,
          user: {
            id: connection.person.id,
            name:
              connection.person.name ||
              connection.person.username ||
              "Alenio member",
            username: connection.person.username,
            image: connection.person.image,
          },
        }));
    return source
      .filter(
        (member) =>
          !normalizedSearch ||
          member.user.name.toLowerCase().includes(normalizedSearch) ||
          member.user.username?.toLowerCase().includes(normalizedSearch),
      )
      .sort((left, right) =>
        left.user.name.localeCompare(right.user.name, undefined, {
          sensitivity: "base",
        }),
      );
  }, [
    connectionsQuery.data?.accepted,
    currentUserId,
    search,
    teamQuery.data?.members,
    workspaceTeamId,
  ]);

  const reset = () => {
    setStep(1);
    setTarget(null);
    setRecognitionType(CELEBRATION_TYPE_KEYS[0]!);
    setMessage("");
    setSearch("");
  };

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const close = () => {
    reset();
    onClose();
  };

  const recognitionMutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Choose someone to recognize.");
      if (workspaceTeamId) {
        return api.post<{ id: string }>(
          `/api/teams/${workspaceTeamId}/activity/celebrate`,
          {
            targetUserId: target.id,
            celebrationType: recognitionType,
            message: message.trim(),
          },
        );
      }
      const payload: CreatePersonalRecognitionRequest = {
        targetUserId: target.id,
        celebrationType: recognitionType,
        message: message.trim(),
      };
      return api.post<CreatePersonalRecognitionResponse>(
        "/api/activity/recognitions",
        payload,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["personal-recognitions"] }),
        queryClient.invalidateQueries({ queryKey: ["account-activity"] }),
        queryClient.invalidateQueries({ queryKey: ["team-activity"] }),
      ]);
      close();
      toast({ title: "Recognition sent", preset: "done" });
    },
    onError: (error) => {
      toast({
        title: "Couldn’t send recognition",
        message: error instanceof Error ? error.message : "Please try again.",
        preset: "error",
      });
    },
  });

  return (
    <AlenioBottomSheet
      visible={visible}
      title={step === 1 ? "Recognize someone" : `Recognize ${target?.name ?? ""}`}
      subtitle={
        step === 1
          ? workspaceTeamId
            ? members.length > 0
              ? `${members.length} teammate${members.length === 1 ? "" : "s"}`
              : "Choose a teammate"
            : members.length > 0
              ? `${members.length} connection${members.length === 1 ? "" : "s"}`
              : "Choose from your Alenio connections"
          : "Choose a type and add a short message"
      }
      onClose={close}
      compact
      showCloseButton
      scrollEnabled={step !== 1}
      testID="recognition-hub-give-sheet"
      footer={
        step === 1 ? (
          <Pressable
            onPress={close}
            style={alenioSheetStyles.cancelButton}
            testID="recognition-hub-give-cancel"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => recognitionMutation.mutate()}
              disabled={
                recognitionMutation.isPending || !target || !message.trim()
              }
              style={[
                alenioSheetStyles.primaryButton,
                recognitionMutation.isPending || !target || !message.trim()
                  ? alenioSheetStyles.primaryButtonDisabled
                  : null,
              ]}
              testID="recognition-hub-give-submit"
            >
              {recognitionMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  Send recognition
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setStep(1)}
              style={alenioSheetStyles.cancelButton}
              testID="recognition-hub-give-back"
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Back</Text>
            </Pressable>
          </>
        )
      }
    >
      {step === 1 ? (
        <View>
          <View style={styles.searchRow}>
            <Search size={16} color="#94A3B8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={
                workspaceTeamId ? "Search teammates" : "Search connections"
              }
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
              autoCapitalize="none"
              style={styles.searchInput}
              testID="recognition-hub-member-search"
            />
            {search ? (
              <Pressable
                onPress={() => setSearch("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={14} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>
          {connectionsQuery.isLoading || teamQuery.isLoading ? (
            <ActivityIndicator color="#6947E8" style={styles.loading} />
          ) : members.length === 0 ? (
            <Text style={styles.emptyText}>
              {search
                ? workspaceTeamId
                  ? "No matching teammates"
                  : "No matching connections"
                : workspaceTeamId
                  ? "No teammates to recognize yet"
                  : "No connections to recognize yet"}
            </Text>
          ) : (
            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              testID="recognition-hub-member-list"
            >
              {members.map((member, index) => (
                <Pressable
                  key={member.userId}
                  onPress={() => {
                    setTarget(member.user);
                    setStep(2);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Recognize ${member.user.name}`}
                  testID={`recognition-hub-member-${member.userId}`}
                  style={[
                    styles.memberRow,
                    index === members.length - 1 ? styles.memberRowLast : null,
                  ]}
                >
                  <UserAvatar
                    user={member.user}
                    size={36}
                    radius={18}
                    backgroundColor="#EEF2FF"
                    textColor="#4361EE"
                    fontSize={13}
                  />
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.user.name}
                    </Text>
                    {member.user.username ? (
                      <Text style={styles.memberHandle} numberOfLines={1}>
                        @{member.user.username}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRight size={16} color="#C5CAD3" strokeWidth={2.2} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <>
          <View>
            <Text style={[alenioSheetStyles.fieldLabel, styles.typeLabel]}>
              Recognition type
            </Text>
            <CelebrationTypePickerCards
              selected={recognitionType}
              onSelect={setRecognitionType}
            />
          </View>
          <AlenioSheetCard tint="slate" compact>
            <Text style={alenioSheetStyles.fieldLabel}>
              Message <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={`Say something meaningful about ${target?.name ?? "them"}...`}
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={300}
              style={[alenioSheetStyles.fieldInput, styles.messageInput]}
              testID="recognition-hub-message"
            />
          </AlenioSheetCard>
        </>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F1F4F8",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 15,
    color: "#172033",
  },
  loading: {
    marginVertical: 24,
  },
  emptyText: {
    paddingVertical: 22,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    color: "#7A8699",
  },
  memberRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8ECF0",
  },
  memberRowLast: {
    borderBottomWidth: 0,
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#172033",
  },
  memberHandle: {
    marginTop: 1,
    fontSize: 13,
    color: "#7A8699",
  },
  typeLabel: {
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  messageInput: {
    minHeight: 82,
    paddingTop: 10,
    textAlignVertical: "top",
  },
});
