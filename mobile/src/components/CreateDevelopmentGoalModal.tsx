import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  X,
  Trash2,
  GripVertical,
  Calendar,
  HelpCircle,
} from "lucide-react-native";
import {
  DEVELOPMENT_PLAN_TIPS,
  defaultGoalDueDate,
  formatGoalDueDate,
  type DevelopmentGoalPriority,
} from "@/lib/development-goal-presets";

export type CreateDevelopmentGoalPayload = {
  skill: string;
  description?: string;
  steps: string[];
  dueDate: string;
  priority: DevelopmentGoalPriority;
  managerNotes?: string;
};

type Props = {
  visible: boolean;
  memberName: string;
  memberImage?: string | null;
  saving?: boolean;
  error?: string | null;
  /** Starting point chosen before the sheet opened, e.g. a goal type shortcut. */
  prefill?: {
    skill?: string;
    description?: string;
    steps?: string[];
  } | null;
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

export function CreateDevelopmentGoalModal({
  visible,
  memberName,
  saving = false,
  error,
  prefill = null,
  onClose,
  onCreate,
}: Props) {
  const insets = useSafeAreaInsets();
  const firstName = memberName.trim().split(/\s+/)[0] || memberName || "this teammate";

  const [customSkill, setCustomSkill] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<Date>(() => defaultGoalDueDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [priority, setPriority] = useState<DevelopmentGoalPriority>("normal");
  const [managerNotes, setManagerNotes] = useState("");
  const [tipsOpen, setTipsOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCustomSkill(prefill?.skill ?? "");
    setSkillDescription(prefill?.description ?? "");
    setSteps(prefill?.steps ?? []);
    setDueDate(defaultGoalDueDate());
    setShowDatePicker(false);
    setPriority("normal");
    setManagerNotes("");
    setTipsOpen(false);
  }, [visible]);

  const showTips = () => {
    setTipsOpen(true);
  };

  const handleCreate = () => {
    const trimmedSteps = steps.map((s) => s.trim()).filter(Boolean);
    onCreate({
      skill: customSkill.trim(),
      description: skillDescription.trim() || undefined,
      steps: trimmedSteps,
      dueDate: dueDate.toISOString(),
      priority,
      managerNotes: managerNotes.trim() || undefined,
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
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flex: 1,
            paddingTop: Platform.OS === "ios" ? 8 : insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <View
            style={{
              width: 38,
              height: 5,
              borderRadius: 3,
              backgroundColor: "#D8DEE8",
              alignSelf: "center",
              marginBottom: 8,
            }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingBottom: 8,
              gap: 10,
            }}
          >
            <Image
              source={require("@/assets/alenio-icon.png")}
              style={{ width: 34, height: 34, borderRadius: 10 }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 19,
                  fontWeight: "800",
                  color: "#172033",
                  letterSpacing: -0.2,
                }}
              >
                Create a development goal
              </Text>
              <Text
                style={{
                  marginTop: 1,
                  fontSize: 10.5,
                  lineHeight: 14,
                  fontWeight: "600",
                  color: "#8A96A8",
                }}
                numberOfLines={1}
              >
                For {memberName}
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
            <Text style={{ fontSize: 11.5, color: "#64748B", lineHeight: 16, marginBottom: 2 }}>
              Help {firstName} build a skill through clear actions and consistent growth.
            </Text>

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
                Enter one skill or competency to focus on.
              </Text>

              <TextInput
                value={customSkill}
                onChangeText={setCustomSkill}
                placeholder="Enter one development skill"
                placeholderTextColor="#94A3B8"
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  backgroundColor: "#FFFFFF",
                  borderRadius: 9,
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                  fontSize: 13,
                  color: "#0F172A",
                }}
                maxLength={200}
              />
              <TextInput
                value={skillDescription}
                onChangeText={setSkillDescription}
                placeholder="Skill description (optional)"
                placeholderTextColor="#94A3B8"
                multiline
                textAlignVertical="top"
                style={{
                  minHeight: 68,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  backgroundColor: "#FFFFFF",
                  borderRadius: 9,
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                  fontSize: 12,
                  lineHeight: 17,
                  color: "#0F172A",
                }}
                maxLength={1000}
              />
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
                  Development Plan Actions
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
                      backgroundColor: "#FFFFFF",
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
                      placeholder={`Action ${index + 1}`}
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
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#4361EE" }}>
                    {steps.length === 0 ? "+ Add action" : "+ Add another action"}
                  </Text>
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
                    backgroundColor: "#FFFFFF",
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
                display={Platform.OS === "ios" ? "inline" : "default"}
                accentColor="#5B42F3"
                themeVariant="light"
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
                  backgroundColor: "#FFFFFF",
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

          {tipsOpen ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                zIndex: 50,
                paddingHorizontal: 24,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(15, 23, 42, 0.46)",
              }}
            >
              <Pressable
                onPress={() => setTipsOpen(false)}
                style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
                accessibilityLabel="Close development plan tips"
              />
              <View
                style={{
                  width: "100%",
                  maxWidth: 360,
                  padding: 20,
                  borderRadius: 24,
                  backgroundColor: "#FFFFFF",
                  shadowColor: "#312E81",
                  shadowOpacity: 0.2,
                  shadowRadius: 24,
                  shadowOffset: { width: 0, height: 12 },
                  elevation: 12,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#F0ECFF",
                    marginBottom: 15,
                  }}
                >
                  <HelpCircle size={22} color="#684BFF" strokeWidth={2.2} />
                </View>
                <Text
                  style={{
                    fontSize: 20,
                    lineHeight: 25,
                    fontWeight: "800",
                    color: "#111827",
                  }}
                >
                  Development plan tips
                </Text>
                <View style={{ marginTop: 12, gap: 10 }}>
                  {DEVELOPMENT_PLAN_TIPS.map((tip, index) => (
                    <View
                      key={tip}
                      style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#F0ECFF",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "800",
                            color: "#684BFF",
                          }}
                        >
                          {index + 1}
                        </Text>
                      </View>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 13,
                          lineHeight: 18,
                          color: "#53627A",
                        }}
                      >
                        {tip}
                      </Text>
                    </View>
                  ))}
                </View>
                <Pressable
                  onPress={() => setTipsOpen(false)}
                  style={{
                    minHeight: 46,
                    marginTop: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 14,
                    backgroundColor: "#5B42F3",
                  }}
                >
                  <Text
                    style={{ fontSize: 13, fontWeight: "800", color: "#FFFFFF" }}
                  >
                    Got it
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
