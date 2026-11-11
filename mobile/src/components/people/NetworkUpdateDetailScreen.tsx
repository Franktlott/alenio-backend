import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft, EyeOff, Trash2 } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import type { NetworkUpdate } from "@/lib/types";
import { NetworkUpdateCard } from "@/components/people/NetworkUpdatesFeed";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
} from "@/components/AlenioBottomSheet";

export function NetworkUpdateDetailScreen({
  activityId,
}: {
  activityId: string;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["network-update-detail", activityId],
    queryFn: () => api.get<NetworkUpdate>(`/api/network-updates/${activityId}`),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["network-update-detail", activityId],
      }),
      queryClient.invalidateQueries({ queryKey: ["network-updates"] }),
    ]);
  };

  const reaction = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/api/network-updates/${activityId}/react`, { emoji }),
    onMutate: () => setPickerOpen(false),
    onSettled: () => void refresh(),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/network-updates/${activityId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["network-updates"] });
      toast({ title: "Update deleted", preset: "done" });
      router.back();
    },
    onError: () => toast({ title: "Couldn’t delete update", preset: "error" }),
  });

  const hide = useMutation({
    mutationFn: () =>
      api.post<void>(`/api/network-updates/${activityId}/hide`, undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["network-updates"] });
      toast({ title: "Update hidden", preset: "done" });
      router.back();
    },
    onError: () => toast({ title: "Couldn’t hide update", preset: "error" }),
  });

  const item = detail.data;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="network-update-detail-back"
        >
          <ChevronLeft size={22} color="#182238" strokeWidth={2.3} />
        </Pressable>
        <Text style={styles.headerTitle}>Update</Text>
        <View style={styles.headerSpacer} />
      </View>

      {detail.isLoading && !item ? (
        <View style={styles.state}>
          <ActivityIndicator color="#6d28d9" />
        </View>
      ) : detail.isError || !item ? (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>This update is unavailable</Text>
          <Text style={styles.stateBody}>
            It may have been removed or is no longer shared with you.
          </Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Back to My Network</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          testID="network-update-detail"
        >
          <NetworkUpdateCard
            item={item}
            currentUserId={currentUserId}
            pickerOpen={pickerOpen}
            commentsOpen
            onTogglePicker={() => setPickerOpen((current) => !current)}
            onReact={(emoji) => reaction.mutate(emoji)}
            onToggleComments={() => undefined}
            onMore={() => setActionsOpen(true)}
          />
        </ScrollView>
      )}

      <AlenioBottomSheet
        visible={actionsOpen && !!item}
        title="Update options"
        subtitle={
          item?.canDelete
            ? "Manage your network update"
            : "Choose what you want to see in your feed"
        }
        onClose={() => setActionsOpen(false)}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="network-update-detail-actions"
      >
        {item?.canDelete ? (
          <AlenioSheetOption
            icon={<Trash2 size={17} color="#FFFFFF" />}
            title="Delete update"
            subtitle="Permanently remove this update"
            destructive
            onPress={() => {
              setActionsOpen(false);
              setTimeout(
                () =>
                  Alert.alert(
                    "Delete network update?",
                    "This removes the update and its comments from your network.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => remove.mutate(),
                      },
                    ],
                  ),
                220,
              );
            }}
          />
        ) : item ? (
          <AlenioSheetOption
            icon={<EyeOff size={17} color="#FFFFFF" />}
            iconColor="#64748B"
            tint="slate"
            title="Hide update"
            subtitle="Only you will stop seeing this update"
            onPress={() => {
              setActionsOpen(false);
              setTimeout(
                () =>
                  Alert.alert(
                    "Hide network update?",
                    "Only you will stop seeing this update. The author won’t be notified.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Hide update",
                        style: "destructive",
                        onPress: () => hide.mutate(),
                      },
                    ],
                  ),
                220,
              );
            }}
          />
        ) : null}
      </AlenioBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    height: 50,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8ECF2",
  },
  back: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#182238",
  },
  headerSpacer: { width: 38 },
  content: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
  },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#182238",
    textAlign: "center",
  },
  stateBody: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    color: "#718096",
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#6d28d9",
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
