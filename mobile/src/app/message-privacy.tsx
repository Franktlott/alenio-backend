import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquareText } from "lucide-react-native";
import { toast } from "burnt";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { api } from "@/lib/api/api";
import { colors } from "@/theme";

const BRAND = colors.brand;

type MessagePrivacy = "everyone" | "connections_and_shared" | "connections_only";

type PrivacySettings = {
  messagePrivacy: MessagePrivacy;
  discoverableByEmail: boolean;
  showActiveStatus: boolean;
};

const PRIVACY_SETTINGS_QUERY_KEY = ["privacy-settings"] as const;

const OPTIONS: Array<{
  value: MessagePrivacy;
  label: string;
  description: string;
}> = [
  {
    value: "everyone",
    label: "Everyone",
    description: "Anyone on Alenio can start a conversation with you.",
  },
  {
    value: "connections_and_shared",
    label: "Connections and shared workspaces",
    description: "Your connections, plus anyone in a workspace or group you share.",
  },
  {
    value: "connections_only",
    label: "Connections only",
    description: "Only people you have accepted as connections.",
  },
];

export default function MessagePrivacyScreen() {
  const queryClient = useQueryClient();

  const { data: privacySettings, isLoading } = useQuery({
    queryKey: PRIVACY_SETTINGS_QUERY_KEY,
    queryFn: () => api.get<PrivacySettings>("/api/privacy-settings"),
  });

  const selected: MessagePrivacy =
    privacySettings?.messagePrivacy ?? "connections_and_shared";

  const save = useMutation({
    mutationFn: (messagePrivacy: MessagePrivacy) =>
      api.patch<PrivacySettings>("/api/privacy-settings", { messagePrivacy }),
    onMutate: async (messagePrivacy) => {
      await queryClient.cancelQueries({ queryKey: PRIVACY_SETTINGS_QUERY_KEY });
      const previous = queryClient.getQueryData<PrivacySettings>(
        PRIVACY_SETTINGS_QUERY_KEY,
      );
      queryClient.setQueryData<PrivacySettings>(PRIVACY_SETTINGS_QUERY_KEY, (current) => ({
        messagePrivacy,
        discoverableByEmail: current?.discoverableByEmail ?? true,
        showActiveStatus: current?.showActiveStatus ?? true,
      }));
      return { previous };
    },
    onError: (_err, _value, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PRIVACY_SETTINGS_QUERY_KEY, context.previous);
      }
      toast({ title: "Couldn’t update messaging privacy", preset: "error" });
    },
    onSuccess: () => {
      toast({ title: "Messaging privacy updated", preset: "done" });
      router.back();
    },
  });

  const handleClose = () => router.back();

  return (
    <AlenioBottomSheet
      asScreen
      title="Who can message me"
      subtitle="Existing conversations are never affected"
      onClose={handleClose}
      showCloseButton
      showScrollIndicator
      bodyHeightRatio={0.55}
      testID="message-privacy-screen"
    >
      <AlenioSheetCard tint="purple">
        <View style={alenioSheetStyles.optionRow}>
          <AlenioSheetIcon color={BRAND}>
            <MessageSquareText size={20} color="#FFFFFF" strokeWidth={2.2} />
          </AlenioSheetIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={alenioSheetStyles.optionTitle}>New conversations</Text>
            <Text style={alenioSheetStyles.optionSubtitle}>
              Choose who can start a chat with you on Alenio.
            </Text>
          </View>
        </View>
      </AlenioSheetCard>

      {isLoading && !privacySettings ? (
        <View style={styles.loading}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : (
        <View style={styles.list} testID="message-privacy-options">
          {OPTIONS.map((option, index) => {
            const isSelected = selected === option.value;
            const isSaving =
              save.isPending && save.variables === option.value;
            return (
              <Pressable
                key={option.value}
                disabled={save.isPending}
                onPress={() => {
                  if (isSelected) {
                    handleClose();
                    return;
                  }
                  save.mutate(option.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                testID={`message-privacy-option-${option.value}`}
              >
                <View
                  style={[
                    styles.row,
                    index > 0 ? styles.rowBorder : null,
                    isSelected ? styles.rowSelected : null,
                  ]}
                >
                  <View
                    style={[
                      styles.radio,
                      isSelected ? styles.radioSelected : null,
                    ]}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : isSelected ? (
                      <Check size={10} color="#FFFFFF" strokeWidth={3} />
                    ) : null}
                  </View>
                  <View style={styles.copy}>
                    <Text
                      style={[
                        styles.title,
                        isSelected ? styles.titleSelected : null,
                      ]}
                      numberOfLines={2}
                    >
                      {option.label}
                    </Text>
                    <Text style={styles.detail} numberOfLines={2}>
                      {option.description}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 36,
    alignItems: "center",
  },
  list: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F6",
  },
  rowSelected: {
    backgroundColor: "#F5F3FF",
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    flexShrink: 0,
  },
  radioSelected: {
    borderWidth: 0,
    backgroundColor: BRAND,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: "#0F172A",
  },
  titleSelected: {
    color: BRAND,
    fontWeight: "700",
  },
  detail: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: "#94A3B8",
  },
});
