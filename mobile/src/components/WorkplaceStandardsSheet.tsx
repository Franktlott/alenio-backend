import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { ChevronDown } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { api } from "@/lib/api/api";
import { fetchOneOnOneTemplates } from "@/lib/member-profile-api";
import {
  formatCheckInFrequencySummary,
  type CheckInFrequencyUnit,
  type WorkplaceStandards,
} from "@/lib/workplace-standards";

type Props = {
  visible: boolean;
  teamId: string;
  initialStandards: WorkplaceStandards;
  onClose: () => void;
  onSaved?: (standards: WorkplaceStandards) => void;
};

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
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          minWidth,
          flexShrink: 1,
          backgroundColor: disabled ? "#F1F5F9" : "#FFFFFF",
          borderWidth: 1,
          borderColor: "#E2E8F0",
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 7,
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#0F172A", flexShrink: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <ChevronDown size={14} color="#64748B" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.35)", justifyContent: "center", paddingHorizontal: 28 }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              overflow: "hidden",
              maxHeight: 280,
            }}
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
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: "#F1F5F9",
                      backgroundColor: selectedOption ? "#EEF2FF" : "#FFFFFF",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: selectedOption ? "700" : "500",
                        color: selectedOption ? "#4338CA" : "#334155",
                      }}
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>{label}</Text>
        <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1, lineHeight: 14 }}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#CBD5E1", true: "#4361EE" }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#CBD5E1"
        testID={testID}
      />
    </View>
  );
}

export function WorkplaceStandardsSheet({
  visible,
  teamId,
  initialStandards,
  onClose,
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WorkplaceStandards>(initialStandards);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(initialStandards);
    setError(null);
  }, [visible, initialStandards]);

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["one-on-one-templates", teamId],
    queryFn: () => fetchOneOnOneTemplates(teamId),
    enabled: visible && !!teamId,
  });

  const templateOptions = useMemo<DropdownOption<string | null>[]>(
    () => [
      { value: null, label: "Any template" },
      ...templates.map((t) => ({ value: t.id, label: t.title })),
    ],
    [templates],
  );

  const selectedTemplateTitle = useMemo(() => {
    if (!draft.requiredCheckInTemplateId) return null;
    return templates.find((t) => t.id === draft.requiredCheckInTemplateId)?.title ?? null;
  }, [draft.requiredCheckInTemplateId, templates]);

  const saveMutation = useMutation({
    mutationFn: async (standards: WorkplaceStandards) => {
      const result = await api.patch<{ workplaceStandards?: WorkplaceStandards }>(`/api/teams/${teamId}`, {
        workplaceStandards: { ...standards, checkInGracePeriodDays: 0 },
      });
      return result.workplaceStandards ?? standards;
    },
    onSuccess: (saved) => {
      toast({ title: "Workplace settings saved", preset: "done" });
      queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      onSaved?.(saved);
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || "Could not save workplace settings.");
    },
  });

  return (
    <AlenioBottomSheet
      visible={visible}
      onClose={onClose}
      title="Workplace Settings"
      subtitle="Check-in and development goals for this workspace."
      showCloseButton
      compact
      testID="workplace-standards-sheet"
      footer={
        <View style={{ gap: 6 }}>
          {error ? (
            <Text style={{ fontSize: 11, color: "#DC2626", textAlign: "center" }}>{error}</Text>
          ) : null}
          <Pressable
            onPress={() => {
              setError(null);
              saveMutation.mutate(draft);
            }}
            disabled={saveMutation.isPending}
            style={[
              alenioSheetStyles.primaryButton,
              { minHeight: 42, paddingVertical: 11, borderRadius: 12 },
              saveMutation.isPending ? alenioSheetStyles.primaryButtonDisabled : null,
            ]}
            testID="workplace-standards-save"
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[alenioSheetStyles.primaryButtonText, { fontSize: 14 }]}>Save</Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={[alenioSheetStyles.cancelButton, { paddingVertical: 4 }]} disabled={saveMutation.isPending}>
            <Text style={[alenioSheetStyles.cancelButtonText, { fontSize: 13 }]}>Cancel</Text>
          </Pressable>
        </View>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
        <AlenioSheetCard compact>
          <ToggleRow
            label="Check-in required"
            hint="Scheduled check-ins for team members."
            value={draft.checkInRequired}
            onValueChange={(checkInRequired) => setDraft((prev) => ({ ...prev, checkInRequired }))}
            testID="workplace-standards-checkin-toggle"
          />

          {draft.checkInRequired ? (
            <View style={{ marginTop: 10, gap: 8 }}>
              <View>
                <Text style={[alenioSheetStyles.fieldLabel, { marginBottom: 4, fontSize: 11 }]}>Frequency</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B" }}>Every</Text>
                  <TextInput
                    value={String(draft.checkInFrequencyValue)}
                    onChangeText={(text) => {
                      const n = Math.max(1, Math.min(365, Number(text.replace(/[^0-9]/g, "")) || 1));
                      setDraft((prev) => ({ ...prev, checkInFrequencyValue: n }));
                    }}
                    keyboardType="number-pad"
                    style={{
                      width: 48,
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 7,
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#0F172A",
                      textAlign: "center",
                      backgroundColor: "#FFFFFF",
                    }}
                    testID="workplace-standards-frequency-value"
                  />
                  <CompactDropdown
                    value={draft.checkInFrequencyUnit}
                    options={FREQUENCY_UNITS}
                    onChange={(checkInFrequencyUnit) => setDraft((prev) => ({ ...prev, checkInFrequencyUnit }))}
                    minWidth={84}
                    testID="workplace-standards-frequency-unit"
                  />
                </View>
              </View>

              <View>
                <Text style={[alenioSheetStyles.fieldLabel, { marginBottom: 4, fontSize: 11 }]}>Required template</Text>
                {templatesLoading ? (
                  <ActivityIndicator color="#4361EE" style={{ marginVertical: 4 }} />
                ) : (
                  <CompactDropdown
                    value={draft.requiredCheckInTemplateId}
                    options={templateOptions}
                    onChange={(requiredCheckInTemplateId) =>
                      setDraft((prev) => ({ ...prev, requiredCheckInTemplateId }))
                    }
                    testID="workplace-standards-template"
                  />
                )}
              </View>
            </View>
          ) : null}
        </AlenioSheetCard>

        <AlenioSheetCard compact>
          <ToggleRow
            label="Development goals required"
            hint="Minimum active goals per member."
            value={draft.goalsRequired}
            onValueChange={(goalsRequired) => setDraft((prev) => ({ ...prev, goalsRequired }))}
            testID="workplace-standards-goals-toggle"
          />

          {draft.goalsRequired ? (
            <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B", flex: 1 }}>Minimum active goals</Text>
              <TextInput
                value={String(draft.minimumActiveGoals)}
                onChangeText={(text) => {
                  const n = Math.max(0, Math.min(50, Number(text.replace(/[^0-9]/g, "")) || 0));
                  setDraft((prev) => ({ ...prev, minimumActiveGoals: n }));
                }}
                keyboardType="number-pad"
                style={{
                  width: 52,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 7,
                  fontSize: 12,
                  fontWeight: "700",
                  color: "#0F172A",
                  textAlign: "center",
                  backgroundColor: "#FFFFFF",
                }}
                testID="workplace-standards-min-goals"
              />
            </View>
          ) : null}
        </AlenioSheetCard>

        <View
          style={{
            backgroundColor: "#F8FAFC",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#E8EDF3",
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Summary
          </Text>
          <Text style={{ fontSize: 12, color: "#475569", lineHeight: 16 }}>
            Check-in {formatCheckInFrequencySummary(draft).toLowerCase()}
            {" · "}
            Goals {draft.goalsRequired ? draft.minimumActiveGoals : "not required"}
            {" · "}
            {selectedTemplateTitle ?? "Any template"}
          </Text>
        </View>
      </ScrollView>
    </AlenioBottomSheet>
  );
}
