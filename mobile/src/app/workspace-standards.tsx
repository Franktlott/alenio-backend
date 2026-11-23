import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Target } from "lucide-react-native";
import { toast } from "burnt";
import { AppHeaderBand } from "@/components/AppHeaderBand";
import {
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
  formatCheckInFrequencySummary,
  mergeWorkplaceStandards,
  type CheckInFrequencyUnit,
  type WorkplaceStandards,
} from "@/lib/workplace-standards";
import { useDuoSheetTopClearance } from "@/lib/adaptive-layout";
import { palette } from "@/theme";

const BAND_SHEET_RADIUS = 0;
const HEADER_ROW = 48;

const FREQUENCY_UNITS: { value: CheckInFrequencyUnit; label: string }[] = [
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
  { value: "months", label: "months" },
];

type DropdownOption<T extends string | null> = { value: T; label: string };

function CompactDropdown<T extends string | null>({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  testID,
  minWidth,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (next: T) => void;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder ?? "Select";

  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        testID={testID}
        style={[styles.dropdown, disabled ? styles.dropdownDisabled : null, minWidth ? { minWidth } : null]}
      >
        <Text style={styles.dropdownLabel} numberOfLines={1}>
          {label}
        </Text>
        <ChevronDown size={14} color={palette.inkMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={styles.dropdownMenu}
          >
            <ScrollView bounces={false}>
              {options.map((option, index) => {
                const selectedOption = option.value === value;
                return (
                  <Pressable
                    key={`${option.label}-${String(option.value)}`}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={[
                      styles.dropdownOption,
                      index > 0 ? styles.dropdownOptionBorder : null,
                      selectedOption ? styles.dropdownOptionSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        selectedOption ? styles.dropdownOptionTextSelected : null,
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="rowTitle">{label}</AppText>
        <AppText variant="supporting" style={{ marginTop: 1 }}>
          {hint}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#CBD5E1", true: palette.violet }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#CBD5E1"
        testID={testID}
      />
    </View>
  );
}

export default function WorkspaceStandardsScreen() {
  const insets = useSafeAreaInsets();
  const duoSheetTop = useDuoSheetTopClearance({ fullScreen: true });
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const { access } = useWorkspaceAccess(teamId);
  const [draft, setDraft] = useState<WorkplaceStandards | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bandHeight = Math.max(insets.top + HEADER_ROW + 18, duoSheetTop);

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

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () =>
      api.get<Team & { workplaceStandards?: WorkplaceStandards }>(
        `/api/teams/${teamId}`,
      ),
    enabled: Boolean(teamId),
  });

  const role = (team?.role ?? "").toLowerCase();
  const isOwner = workspaceManagementCapabilities(role).canDelete;
  const canEdit = isOwner && access.features.team && access.canWrite;

  const standards = useMemo(
    () => mergeWorkplaceStandards(team?.workplaceStandards),
    [team?.workplaceStandards],
  );

  useEffect(() => {
    setDraft(standards);
    setError(null);
  }, [standards]);

  const saveMutation = useMutation({
    mutationFn: async (next: WorkplaceStandards) => {
      const result = await api.patch<{ workplaceStandards?: WorkplaceStandards }>(
        `/api/teams/${teamId}`,
        {
          workplaceStandards: {
            ...next,
            requiredCheckInTemplateId: null,
            checkInGracePeriodDays: 0,
          },
        },
      );
      return result.workplaceStandards ?? next;
    },
    onSuccess: () => {
      toast({ title: "Development standards saved", preset: "done" });
      void queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      void queryClient.invalidateQueries({
        queryKey: ["team", teamId, "workplaceStandards"],
      });
      goBack();
    },
    onError: (err: Error) => {
      setError(err.message || "Could not save workplace settings.");
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
          testID="workspace-standards-back"
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.bandTitle} numberOfLines={1}>
            Development standards
          </Text>
        </View>
        <View style={styles.topActionPlaceholder} />
      </View>
    </>
  );

  if (!teamId) {
    return (
      <View style={styles.screen} testID="workspace-standards-screen">
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
    <View style={styles.screen} testID="workspace-standards-screen">
      {header}
      <View style={styles.sheet}>
        {teamLoading || !draft ? (
          <View style={styles.centered}>
            <ActivityIndicator color={palette.violet} />
          </View>
        ) : !canEdit ? (
          <View style={styles.centered}>
            <AppText variant="sectionTitle">Standards unavailable</AppText>
            <AppText
              variant="supporting"
              style={{ marginTop: 6, textAlign: "center", maxWidth: 280 }}
            >
              Only the workspace owner can edit development standards on an
              active plan.
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
          <>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.content,
                { paddingBottom: Math.max(insets.bottom, 20) + 88 },
              ]}
              testID="workspace-standards-content"
            >
              <Card>
                <View style={styles.heroRow}>
                  <IconTile tint="lavender" size={44}>
                    <Target
                      size={20}
                      color={tintInk("lavender")}
                      strokeWidth={2.2}
                    />
                  </IconTile>
                  <View style={styles.heroCopy}>
                    <AppText variant="sectionLabel" color={palette.violet}>
                      Expectations
                    </AppText>
                    <AppText variant="sectionTitle" style={styles.heroTitle}>
                      Check-ins and goals
                    </AppText>
                    <AppText variant="supporting" style={{ marginTop: 2 }}>
                      Set shared development expectations for this workspace.
                    </AppText>
                  </View>
                </View>
              </Card>

              <View style={styles.sectionBlock}>
                <SectionHeader label="Check-ins" />
                <Card>
                  <ToggleRow
                    label="Check-in required"
                    hint="Scheduled check-ins for team members."
                    value={draft.checkInRequired}
                    onValueChange={(checkInRequired) =>
                      setDraft((prev) =>
                        prev ? { ...prev, checkInRequired } : prev,
                      )
                    }
                    testID="workplace-standards-checkin-toggle"
                  />

                  {draft.checkInRequired ? (
                    <View style={styles.fieldStack}>
                      <View>
                        <AppText
                          variant="sectionLabel"
                          style={{ marginBottom: 6 }}
                        >
                          Frequency
                        </AppText>
                        <View style={styles.frequencyRow}>
                          <AppText variant="supporting">Every</AppText>
                          <TextInput
                            value={String(draft.checkInFrequencyValue)}
                            onChangeText={(text) => {
                              const n = Math.max(
                                1,
                                Math.min(
                                  365,
                                  Number(text.replace(/[^0-9]/g, "")) || 1,
                                ),
                              );
                              setDraft((prev) =>
                                prev
                                  ? { ...prev, checkInFrequencyValue: n }
                                  : prev,
                              );
                            }}
                            keyboardType="number-pad"
                            style={styles.numberInput}
                            testID="workplace-standards-frequency-value"
                          />
                          <CompactDropdown
                            value={draft.checkInFrequencyUnit}
                            options={FREQUENCY_UNITS}
                            onChange={(checkInFrequencyUnit) =>
                              setDraft((prev) =>
                                prev
                                  ? { ...prev, checkInFrequencyUnit }
                                  : prev,
                              )
                            }
                            minWidth={84}
                            testID="workplace-standards-frequency-unit"
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}
                </Card>
              </View>

              <View style={styles.sectionBlock}>
                <SectionHeader label="Goals" />
                <Card>
                  <ToggleRow
                    label="Development goals required"
                    hint="Minimum active goals per member."
                    value={draft.goalsRequired}
                    onValueChange={(goalsRequired) =>
                      setDraft((prev) =>
                        prev ? { ...prev, goalsRequired } : prev,
                      )
                    }
                    testID="workplace-standards-goals-toggle"
                  />

                  {draft.goalsRequired ? (
                    <View style={styles.goalsRow}>
                      <AppText variant="supporting" style={{ flex: 1 }}>
                        Minimum active goals
                      </AppText>
                      <TextInput
                        value={String(draft.minimumActiveGoals)}
                        onChangeText={(text) => {
                          const n = Math.max(
                            0,
                            Math.min(
                              50,
                              Number(text.replace(/[^0-9]/g, "")) || 0,
                            ),
                          );
                          setDraft((prev) =>
                            prev ? { ...prev, minimumActiveGoals: n } : prev,
                          );
                        }}
                        keyboardType="number-pad"
                        style={styles.numberInput}
                        testID="workplace-standards-min-goals"
                      />
                    </View>
                  ) : null}
                </Card>
              </View>

              <Card style={styles.summaryCard}>
                <AppText variant="sectionLabel">Summary</AppText>
                <AppText variant="supporting" style={{ marginTop: 4 }}>
                  Check-in {formatCheckInFrequencySummary(draft).toLowerCase()}
                  {" · "}
                  Goals{" "}
                  {draft.goalsRequired
                    ? draft.minimumActiveGoals
                    : "not required"}
                  {" · "}
                  Any check-in works
                </AppText>
              </Card>
            </ScrollView>

            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              {error ? (
                <AppText
                  variant="supporting"
                  color="#DC2626"
                  style={{ textAlign: "center", marginBottom: 8 }}
                >
                  {error}
                </AppText>
              ) : null}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                label="Save"
                loading={saveMutation.isPending}
                disabled={saveMutation.isPending}
                onPress={() => {
                  setError(null);
                  saveMutation.mutate(draft);
                }}
                testID="workplace-standards-save"
              />
              <Button
                variant="ghost"
                size="md"
                fullWidth
                label="Cancel"
                disabled={saveMutation.isPending}
                onPress={goBack}
              />
            </View>
          </>
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldStack: {
    marginTop: 12,
    gap: 12,
  },
  frequencyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  goalsRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  numberInput: {
    width: 52,
    borderWidth: 1,
    borderColor: "#E4E0EF",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "700",
    color: palette.ink,
    textAlign: "center",
    backgroundColor: "#FFFFFF",
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E0EF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dropdownDisabled: {
    backgroundColor: "#F1F5F9",
    opacity: 0.7,
  },
  dropdownLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.ink,
    flexShrink: 1,
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  dropdownMenu: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    overflow: "hidden",
    maxHeight: 280,
  },
  dropdownOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  dropdownOptionBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.rowDivider,
  },
  dropdownOptionSelected: {
    backgroundColor: "#EFE9FF",
  },
  dropdownOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: palette.inkSecondary,
  },
  dropdownOptionTextSelected: {
    fontWeight: "700",
    color: palette.violet,
  },
  summaryCard: {
    backgroundColor: "#FBFAFF",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 6,
    backgroundColor: palette.page,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.cardBorder,
  },
});
