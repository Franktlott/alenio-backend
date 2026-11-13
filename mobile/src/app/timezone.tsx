import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3 } from "lucide-react-native";
import { toast } from "burnt";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY, type MeUser } from "@/lib/auth/me-query";
import {
  COMMON_TIMEZONES,
  formatTimeZoneLabel,
  resolveTimeZone,
} from "@/lib/timezone";
import { colors } from "@/theme";

const BRAND = colors.brand;

function timezoneParts(timeZone: string): { title: string; detail: string } {
  const label = formatTimeZoneLabel(timeZone);
  const match = label.match(/^(.*)\s\((.+)\)$/);
  if (match) {
    return { title: match[1], detail: match[2] };
  }
  return { title: label, detail: timeZone };
}

export default function TimezoneScreen() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: me, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get<MeUser>("/api/me"),
  });

  const selected = resolveTimeZone(me?.timezone);

  const save = useMutation({
    mutationFn: (timezone: string) =>
      api.patch<MeUser>("/api/profile", { timezone }),
    onMutate: (timezone) => {
      setSaving(timezone);
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      toast({ title: "Time zone updated", preset: "done" });
      router.back();
    },
    onError: () => {
      toast({ title: "Couldn’t update time zone", preset: "error" });
    },
    onSettled: () => {
      setSaving(null);
    },
  });

  const handleClose = () => router.back();

  return (
    <AlenioBottomSheet
      asScreen
      title="Time zone"
      subtitle="Used for due dates, schedules, and recurring work"
      onClose={handleClose}
      showCloseButton
      showScrollIndicator
      bodyHeightRatio={0.7}
      testID="timezone-screen"
    >
      <AlenioSheetCard tint="purple">
        <View style={alenioSheetStyles.optionRow}>
          <AlenioSheetIcon color={BRAND}>
            <Clock3 size={20} color="#FFFFFF" strokeWidth={2.2} />
          </AlenioSheetIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={alenioSheetStyles.optionTitle}>Your local time</Text>
            <Text style={alenioSheetStyles.optionSubtitle}>
              Alenio uses this when showing deadlines and calendar times.
            </Text>
          </View>
        </View>
      </AlenioSheetCard>

      {isLoading && !me ? (
        <View style={styles.loading}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : (
        <View style={styles.list} testID="timezone-options">
          {COMMON_TIMEZONES.map((tz, index) => {
            const isSelected = selected === tz;
            const isSaving = saving === tz;
            const { title, detail } = timezoneParts(tz);
            return (
              <Pressable
                key={tz}
                disabled={save.isPending}
                onPress={() => {
                  if (isSelected) {
                    handleClose();
                    return;
                  }
                  save.mutate(tz);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                testID={`timezone-option-${tz.replaceAll("/", "-")}`}
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
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    <Text style={styles.detail} numberOfLines={1}>
                      {detail}
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
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
    lineHeight: 16,
    fontWeight: "600",
    color: "#0F172A",
  },
  titleSelected: {
    color: BRAND,
    fontWeight: "700",
  },
  detail: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 13,
    color: "#94A3B8",
  },
});
