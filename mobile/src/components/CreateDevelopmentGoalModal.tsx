import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  Image,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  X,
  Search,
  Plus,
  Trash2,
  GripVertical,
  Calendar,
  Target,
  Mountain,
  HelpCircle,
  Check,
} from "lucide-react-native";
import {
  DEVELOPMENT_PLAN_TIPS,
  SKILL_PRESETS,
  buildManagerNotesPayload,
  defaultGoalDueDate,
  formatGoalDueDate,
  type DevelopmentGoalPriority,
  type SkillPreset,
} from "@/lib/development-goal-presets";

export type CreateDevelopmentGoalPayload = {
  skill: string;
  steps: string[];
  managerNotes?: string;
};

type Props = {
  visible: boolean;
  memberName: string;
  memberImage?: string | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (payload: CreateDevelopmentGoalPayload) => void;
};

const PRIORITIES: DevelopmentGoalPriority[] = ["low", "normal", "high"];

function StepBadge({ n }: { n: number }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: "#EEF2FF",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: "800", color: "#4F46E5" }}>{n}</Text>
    </View>
  );
}

function SkillIcon({ preset }: { preset: SkillPreset }) {
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 5,
        backgroundColor: preset.color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Target size={9} color="#FFFFFF" strokeWidth={2.5} />
    </View>
  );
}

export function CreateDevelopmentGoalModal({
  visible,
  memberName,
  memberImage,
  saving = false,
  error,
  onClose,
  onCreate,
}: Props) {
  const insets = useSafeAreaInsets();
  const firstName = memberName.trim().split(/\s+/)[0] || memberName || "this teammate";
  const initial = memberName.trim()?.[0]?.toUpperCase() || "?";

  const [skillQuery, setSkillQuery] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>("leadership");
  const [customMode, setCustomMode] = useState(false);
  const [customSkill, setCustomSkill] = useState("");
  const [steps, setSteps] = useState<string[]>(SKILL_PRESETS[0]?.steps ?? [""]);
  const [dueDate, setDueDate] = useState<Date>(() => defaultGoalDueDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [priority, setPriority] = useState<DevelopmentGoalPriority>("normal");
  const [managerNotes, setManagerNotes] = useState("");

  useEffect(() => {
    if (!visible) return;
    setSkillQuery("");
    setSelectedPresetId("leadership");
    setCustomMode(false);
    setCustomSkill("");
    setSteps(SKILL_PRESETS[0]?.steps ?? [""]);
    setDueDate(defaultGoalDueDate());
    setShowDatePicker(false);
    setPriority("normal");
    setManagerNotes("");
  }, [visible]);

  const filteredPresets = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    if (!q) return SKILL_PRESETS;
    return SKILL_PRESETS.filter((p) => p.label.toLowerCase().includes(q));
  }, [skillQuery]);

  const resolvedSkill = customMode
    ? customSkill.trim()
    : SKILL_PRESETS.find((p) => p.id === selectedPresetId)?.label ?? "";

  const selectPreset = (preset: SkillPreset) => {
    setCustomMode(false);
    setSelectedPresetId(preset.id);
    setCustomSkill("");
    setSteps([...preset.steps]);
  };

  const enableCustom = () => {
    setCustomMode(true);
    setSelectedPresetId(null);
    setSteps([""]);
  };

  const showTips = () => {
    Alert.alert("Development plan tips", DEVELOPMENT_PLAN_TIPS.map((t) => `• ${t}`).join("\n"));
  };

  const handleCreate = () => {
    const trimmedSteps = steps.map((s) => s.trim()).filter(Boolean);
    onCreate({
      skill: resolvedSkill,
      steps: trimmedSteps,
      managerNotes: buildManagerNotesPayload({
        dueDate,
        priority,
        notes: managerNotes,
      }),
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#F8FAFC" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flex: 1,
            paddingTop: Platform.OS === "ios" ? 10 : insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingBottom: 8,
              gap: 10,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: "#EEF2FF",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {memberImage ? (
                <Image source={{ uri: memberImage }} style={{ width: 34, height: 34 }} />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#4F46E5" }}>{initial}</Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "700",
                  color: "#818CF8",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                Creating goal for
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                {memberName}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={16} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16, gap: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 2 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A", letterSpacing: -0.3 }}>
                  Create Development Goal
                </Text>
                <Text style={{ fontSize: 12, color: "#64748B", marginTop: 3, lineHeight: 16 }}>
                  Help {firstName} build a skill through clear actions and consistent growth.
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, paddingTop: 2 }}>
                <Target size={22} color="#A5B4FC" strokeWidth={1.8} />
                <Mountain size={20} color="#C4B5FD" strokeWidth={1.8} />
              </View>
            </View>

            {error ? (
              <Text style={{ fontSize: 12, color: "#DC2626", fontWeight: "600" }}>{error}</Text>
            ) : null}

            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#E8ECFA",
                padding: 10,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <StepBadge n={1} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>Development skill</Text>
              </View>
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: -2 }}>
                Choose a skill or competency to focus on.
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: "#F8FAFC",
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 9,
                  paddingHorizontal: 9,
                  paddingVertical: Platform.OS === "ios" ? 8 : 4,
                }}
              >
                <Search size={13} color="#94A3B8" />
                <TextInput
                  value={skillQuery}
                  onChangeText={setSkillQuery}
                  placeholder="Search skills or choose below"
                  placeholderTextColor="#94A3B8"
                  style={{ flex: 1, fontSize: 13, color: "#0F172A", paddingVertical: 2 }}
                />
              </View>

              {!customMode ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {filteredPresets.map((preset) => {
                    const selected = selectedPresetId === preset.id;
                    return (
                      <Pressable
                        key={preset.id}
                        onPress={() => selectPreset(preset)}
                        style={{
                          width: "48%",
                          flexGrow: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          backgroundColor: selected ? preset.bg : "#FFFFFF",
                          borderWidth: 1,
                          borderColor: selected ? preset.border : "#E2E8F0",
                          borderRadius: 9,
                          paddingHorizontal: 8,
                          paddingVertical: 7,
                        }}
                      >
                        <SkillIcon preset={preset} />
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 11,
                            fontWeight: selected ? "700" : "600",
                            color: selected ? preset.color : "#334155",
                          }}
                          numberOfLines={1}
                        >
                          {preset.label}
                        </Text>
                        {selected ? <Check size={12} color={preset.color} strokeWidth={2.5} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <TextInput
                  value={customSkill}
                  onChangeText={setCustomSkill}
                  placeholder="Enter a custom skill"
                  placeholderTextColor="#94A3B8"
                  autoFocus
                  style={{
                    borderWidth: 1,
                    borderColor: "#C7D2FE",
                    backgroundColor: "#F8FAFC",
                    borderRadius: 9,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    fontSize: 13,
                    color: "#0F172A",
                  }}
                />
              )}

              <Pressable
                onPress={customMode ? () => selectPreset(SKILL_PRESETS[0]!) : enableCustom}
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 9,
                  paddingVertical: 8,
                  alignItems: "center",
                  backgroundColor: "#FAFBFF",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#4361EE" }}>
                  {customMode ? "Choose from skills" : "+ Custom skill"}
                </Text>
              </Pressable>
            </View>

            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#E8ECFA",
                padding: 10,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <StepBadge n={2} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A", flex: 1 }}>
                  Development plan
                </Text>
                <Pressable
                  onPress={showTips}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                >
                  <HelpCircle size={12} color="#94A3B8" />
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B" }}>Tips</Text>
                </Pressable>
              </View>
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: -2 }}>
                Define the key actions {firstName} will take.
              </Text>

              <View style={{ gap: 5 }}>
                {steps.map((step, index) => (
                  <View
                    key={`step-${index}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      borderRadius: 9,
                      paddingHorizontal: 7,
                      paddingVertical: 6,
                    }}
                  >
                    <GripVertical size={12} color="#CBD5E1" />
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        borderWidth: 1.5,
                        borderColor: "#CBD5E1",
                        backgroundColor: "#FFFFFF",
                      }}
                    />
                    <TextInput
                      value={step}
                      onChangeText={(v) => setSteps(steps.map((s, i) => (i === index ? v : s)))}
                      placeholder={`Action step ${index + 1}`}
                      placeholderTextColor="#94A3B8"
                      style={{ flex: 1, fontSize: 12, color: "#0F172A", paddingVertical: 0 }}
                    />
                    {steps.length > 1 ? (
                      <Pressable onPress={() => setSteps(steps.filter((_, i) => i !== index))} hitSlop={8}>
                        <Trash2 size={13} color="#F87171" />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>

              {steps.length < 10 ? (
                <Pressable
                  onPress={() => setSteps([...steps, ""])}
                  style={{
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 9,
                    paddingVertical: 8,
                    alignItems: "center",
                    backgroundColor: "#FAFBFF",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#4361EE" }}>+ Add another step</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E8ECFA",
                  padding: 10,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <StepBadge n={3} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>Due date</Text>
                </View>
                <Pressable
                  onPress={() => setShowDatePicker((v) => !v)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    backgroundColor: "#F8FAFC",
                    borderRadius: 9,
                    paddingHorizontal: 8,
                    paddingVertical: 8,
                  }}
                >
                  <Calendar size={13} color="#64748B" />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#0F172A" }}>
                    {formatGoalDueDate(dueDate)}
                  </Text>
                </Pressable>
              </View>

              <View
                style={{
                  flex: 1.15,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E8ECFA",
                  padding: 10,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <StepBadge n={4} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>Priority</Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: "#F1F5F9",
                    borderRadius: 9,
                    padding: 2,
                    gap: 2,
                  }}
                >
                  {PRIORITIES.map((p) => {
                    const selected = priority === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => setPriority(p)}
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 7,
                          alignItems: "center",
                          backgroundColor: selected ? "#FFFFFF" : "transparent",
                          borderWidth: selected ? 1 : 0,
                          borderColor: selected ? "#C7D2FE" : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: selected ? "#4F46E5" : "#64748B",
                            textTransform: "capitalize",
                          }}
                        >
                          {p}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {showDatePicker ? (
              <DateTimePicker
                value={dueDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  if (Platform.OS !== "ios") setShowDatePicker(false);
                  if (date) setDueDate(date);
                }}
                minimumDate={new Date()}
              />
            ) : null}

            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#E8ECFA",
                padding: 10,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <StepBadge n={5} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>
                  Manager notes <Text style={{ fontWeight: "500", color: "#94A3B8" }}>(optional)</Text>
                </Text>
              </View>
              <TextInput
                value={managerNotes}
                onChangeText={(v) => setManagerNotes(v.slice(0, 250))}
                placeholder="Add any context or notes about this goal..."
                placeholderTextColor="#94A3B8"
                multiline
                style={{
                  minHeight: 72,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  backgroundColor: "#F8FAFC",
                  borderRadius: 9,
                  paddingHorizontal: 10,
                  paddingTop: 8,
                  paddingBottom: 8,
                  fontSize: 12,
                  color: "#0F172A",
                  textAlignVertical: "top",
                }}
              />
              <Text style={{ fontSize: 10, color: "#94A3B8", textAlign: "right" }}>
                {managerNotes.length}/250
              </Text>
            </View>
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 14,
              paddingTop: 8,
              paddingBottom: Math.max(8, Platform.OS === "android" ? 8 : 0),
              borderTopWidth: 1,
              borderTopColor: "#E8ECFA",
              backgroundColor: "#FFFFFF",
            }}
          >
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{
                flex: 1,
                paddingVertical: 11,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                backgroundColor: "#FFFFFF",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleCreate}
              disabled={saving}
              style={{
                flex: 1.2,
                paddingVertical: 11,
                borderRadius: 10,
                backgroundColor: saving ? "#A5B4FC" : "#4361EE",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 6,
              }}
              testID="create-development-goal-submit"
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>Create goal</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
