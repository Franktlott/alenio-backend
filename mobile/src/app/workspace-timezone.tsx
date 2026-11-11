import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3 } from "lucide-react-native";
import { toast } from "burnt";
import { AppHeaderBand } from "@/components/AppHeaderBand";
import {
  AlenioList,
  AlenioListRow,
  AppText,
  Button,
  Card,
  IconTile,
  SectionHeader,
  tintInk,
} from "@/components/ui";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { workspaceManagementCapabilities } from "@/lib/workspace-management";
import {
  COMMON_TIMEZONES,
  formatTimeZoneLabel,
  resolveTimeZone,
} from "@/lib/timezone";
import { palette } from "@/theme";

const BAND_SHEET_RADIUS = 24;
const HEADER_ROW = 48;

export default function WorkspaceTimezoneScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const { access } = useWorkspaceAccess(teamId);
  const bandHeight = insets.top + HEADER_ROW + 18;

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, []),
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/workspace-settings", params: { teamId } });
  };

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: Boolean(teamId),
  });

  const role = (team?.role ?? "").toLowerCase();
  const isOwner = workspaceManagementCapabilities(role).canDelete;
  const canEdit = isOwner && access.canWrite;
  const selectedTimezone = resolveTimeZone(team?.timezone);

  const updateMutation = useMutation({
    mutationFn: (timezone: string) =>
      api.patch<Team>(`/api/teams/${teamId}`, {
        name: team?.name ?? "",
        image: team?.image ?? null,
        location: team?.location ?? null,
        timezone,
      }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      void queryClient.invalidateQueries({ queryKey: ["team", updated.id] });
      toast({ title: "Workspace updated", preset: "done" });
      goBack();
    },
    onError: () => {
      toast({ title: "Failed to update workspace", preset: "error" });
    },
  });

  const header = (
    <>
      <AppHeaderBand height={bandHeight} />
      <View style={[styles.bandHeader, { paddingTop: insets.top }]}>
        <Pressable
          onPress={goBack}
          hitSlop={10}
          style={styles.headerAction}
          accessibilityRole="button"
          accessibilityLabel="Back to workspace settings"
          testID="workspace-timezone-back"
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.bandTitle} numberOfLines={1}>
            Workspace timezone
          </Text>
        </View>
        <View style={styles.topActionPlaceholder} />
      </View>
    </>
  );

  if (!teamId) {
    return (
      <View style={styles.screen} testID="workspace-timezone-screen">
        {header}
        <View style={styles.sheet}>
          <View style={styles.centered}>
            <AppText variant="body" color={palette.inkMuted}>
              No workspace selected
            </AppText>
            <Button
              variant="primary"
              size="md"
              label="Go back"
              onPress={goBack}
              style={{ marginTop: 16 }}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="workspace-timezone-screen">
      {header}
      <View style={styles.sheet}>
        {isLoading || !team ? (
          <View style={styles.centered}>
            <ActivityIndicator color={palette.violet} />
          </View>
        ) : !canEdit ? (
          <View style={styles.centered}>
            <AppText variant="sectionTitle">Timezone unavailable</AppText>
            <AppText
              variant="supporting"
              style={{ marginTop: 6, textAlign: "center", maxWidth: 280 }}
            >
              Only the workspace owner can change the timezone.
            </AppText>
            <Button
              variant="primary"
              size="md"
              label="Go back"
              onPress={goBack}
              style={{ marginTop: 16 }}
            />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, 20) + 16 },
            ]}
            testID="workspace-timezone-picker"
          >
            <Card>
              <View style={styles.heroRow}>
                <IconTile tint="lavender" size={44}>
                  <Clock3
                    size={20}
                    color={tintInk("lavender")}
                    strokeWidth={2.2}
                  />
                </IconTile>
                <View style={styles.heroCopy}>
                  <AppText variant="sectionLabel" color={palette.violet}>
                    Schedule
                  </AppText>
                  <AppText variant="sectionTitle" style={styles.heroTitle}>
                    Workspace timezone
                  </AppText>
                  <AppText variant="supporting" style={{ marginTop: 2 }}>
                    Timed workspace events are scheduled in this timezone.
                  </AppText>
                </View>
              </View>
            </Card>

            <View style={styles.sectionBlock}>
              <SectionHeader label="Choose a timezone" />
              <AlenioList>
                {COMMON_TIMEZONES.map((timezone) => {
                  const selected = selectedTimezone === timezone;
                  return (
                    <AlenioListRow
                      key={timezone}
                      title={formatTimeZoneLabel(timezone)}
                      onPress={
                        updateMutation.isPending
                          ? undefined
                          : () => {
                              if (selected) {
                                goBack();
                                return;
                              }
                              updateMutation.mutate(timezone);
                            }
                      }
                      style={
                        updateMutation.isPending ? styles.rowBusy : undefined
                      }
                      trailing={
                        selected ? (
                          <Check
                            size={15}
                            color={palette.violet}
                            strokeWidth={2.5}
                          />
                        ) : undefined
                      }
                      testID={`workspace-timezone-option-${timezone.replaceAll("/", "-")}`}
                    />
                  );
                })}
              </AlenioList>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.page,
  },
  bandHeader: {
    zIndex: 2,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  topActionPlaceholder: {
    width: 34,
    height: 34,
  },
  topTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  bandTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.25,
  },
  sheet: {
    flex: 1,
    marginTop: -8,
    borderTopLeftRadius: BAND_SHEET_RADIUS,
    borderTopRightRadius: BAND_SHEET_RADIUS,
    backgroundColor: palette.page,
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  centered: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    marginTop: 2,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  sectionBlock: {
    gap: 0,
  },
  rowBusy: {
    opacity: 0.55,
  },
});
