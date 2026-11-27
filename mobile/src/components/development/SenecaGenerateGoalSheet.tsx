import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowRight,
  Calendar,
  ChartColumn,
  Clock,
  Layers,
  MessageCircle,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import {
  defaultGoalDueDate,
  formatGoalDueDate,
  type DevelopmentGoalPriority,
} from "@/lib/development-goal-presets";
import { fetchSenecaQuickGoal } from "@/lib/seneca-api";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";
import type { CreateDevelopmentGoalPayload } from "@/components/CreateDevelopmentGoalModal";
import { colors } from "@/theme";

type Phase = "prompt" | "generating" | "review";

type Props = {
  visible: boolean;
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName?: string | null;
  /** Signed-in person is creating a goal for themselves. */
  isSelf?: boolean;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (payload: CreateDevelopmentGoalPayload) => void;
};

const MAX_PROMPT = 500;
const MAX_STEPS = 5;
const PRIORITIES: DevelopmentGoalPriority[] = ["low", "normal", "high"];

const INSPIRATION = [
  { id: "communication", label: "Communication", Icon: MessageCircle },
  { id: "accountability", label: "Accountability", Icon: Users },
  { id: "delegation", label: "Delegation", Icon: Layers },
  { id: "coaching", label: "Coaching others", Icon: ChartColumn },
  { id: "time", label: "Time management", Icon: Clock },
  { id: "decisions", label: "Decision-making", Icon: Target },
] as const;

const HOW_IT_WORKS = [
  { title: "Describe", body: "Share the development area." },
  { title: "Generate", body: "Seneca creates a personalized goal and actions." },
  { title: "Review", body: "Edit and refine the details." },
  { title: "Create", body: "Turn it into an active goal." },
] as const;

function copyFor(isSelf: boolean, firstName: string, memberName: string) {
  if (isSelf) {
    return {
      subtitle: "Your development goal",
      banner:
        "Turn potential into a plan. Tell Seneca what you want to develop. We’ll create a personalized goal with clear, actionable steps.",
      promptLabel: "What would you like to develop?",
      placeholder:
        "Describe a skill, opportunity, or behavior you’d like to improve...",
    };
  }
  return {
    subtitle: `Development goal for ${memberName}`,
    banner: `Turn potential into a plan. Tell Seneca what ${firstName} needs to develop. We’ll create a personalized goal with clear, actionable steps.`,
    promptLabel: `What would you like ${firstName} to develop?`,
    placeholder: `Describe a skill, opportunity, or behavior you’d like ${firstName} to improve...`,
  };
}

export function SenecaGenerateGoalSheet({
  visible,
  teamId,
  memberUserId,
  memberName,
  managerName = null,
  isSelf = false,
  saving = false,
  error = null,
  onClose,
  onCreate,
}: Props) {
  const insets = useSafeAreaInsets();
  const firstName =
    memberName.trim().split(/\s+/)[0] || memberName || "this teammate";
  const copy = useMemo(
    () => copyFor(isSelf, firstName, memberName),
    [isSelf, firstName, memberName],
  );

  const [phase, setPhase] = useState<Phase>("prompt");
  const [prompt, setPrompt] = useState("");
  const [skill, setSkill] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<Date>(() => defaultGoalDueDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [priority, setPriority] = useState<DevelopmentGoalPriority>("normal");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPhase("prompt");
    setPrompt("");
    setSkill("");
    setSteps([]);
    setDueDate(defaultGoalDueDate());
    setShowDatePicker(false);
    setPriority("normal");
    setLocalError(null);
  }, [visible]);

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setLocalError(
        isSelf
          ? "Share what you’d like to develop, then generate."
          : `Share what you’d like ${firstName} to develop, then generate.`,
      );
      return;
    }

    setPhase("generating");
    setLocalError(null);
    try {
      const draft = await fetchSenecaQuickGoal(teamId, memberUserId, {
        skillOrGoal: trimmed,
        memberName,
        managerName,
      });
      setSkill(draft.skill);
      setSteps(draft.steps.slice(0, MAX_STEPS));
      setPhase("review");
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : "Seneca could not build that goal.",
      );
      setPhase("prompt");
    }
  };

  const handleCreate = () => {
    const trimmedSteps = steps.map((s) => s.trim()).filter(Boolean);
    if (!skill.trim() || trimmedSteps.length === 0) {
      setLocalError("Add a skill title and at least one action.");
      return;
    }
    onCreate({
      skill: skill.trim(),
      steps: trimmedSteps,
      dueDate: dueDate.toISOString(),
      priority,
    });
  };

  const displayError = localError || error;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={saving ? undefined : onClose}
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
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingBottom: 10,
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
                  fontSize: 16,
                  lineHeight: 20,
                  fontWeight: "800",
                  color: "#172033",
                  letterSpacing: -0.2,
                }}
              >
                {phase === "review" ? "Review your goal" : "Generate with Seneca"}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  lineHeight: 15,
                  fontWeight: "600",
                  color: "#8A96A8",
                }}
                numberOfLines={1}
              >
                {copy.subtitle}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              disabled={saving}
              hitSlop={10}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityLabel="Close"
            >
              <X size={16} color="#64748B" />
            </Pressable>
          </View>

          {phase === "generating" ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 28,
                gap: 14,
              }}
            >
              <SenecaIcon size={56} />
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: "#172033",
                  textAlign: "center",
                }}
              >
                Seneca is building your goal
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: "#64748B",
                  textAlign: "center",
                }}
              >
                Drafting a clear skill title and actionable steps…
              </Text>
              <ActivityIndicator color="#7C3AED" style={{ marginTop: 6 }} />
            </View>
          ) : (
            <>
              <ScrollView
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingBottom: 18,
                  gap: 14,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {phase === "prompt" ? (
                  <>
                    <View
                      style={{
                        borderRadius: 16,
                        paddingHorizontal: 14,
                        paddingVertical: 14,
                        backgroundColor: "#F3F0FF",
                        borderWidth: 1,
                        borderColor: "#E4DEFF",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <Sparkles size={18} color="#7C3AED" strokeWidth={2.2} />
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 13,
                          lineHeight: 18,
                          fontWeight: "600",
                          color: "#4338CA",
                        }}
                      >
                        {copy.banner}
                      </Text>
                      <SenecaIcon size={40} />
                    </View>

                    {displayError ? (
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: "#DC2626",
                        }}
                      >
                        {displayError}
                      </Text>
                    ) : null}

                    <View style={{ gap: 8 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "800",
                          color: "#0F172A",
                        }}
                      >
                        {copy.promptLabel}
                      </Text>
                      <View
                        style={{
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: "#E2E8F0",
                          backgroundColor: "#FFFFFF",
                          paddingHorizontal: 12,
                          paddingTop: 12,
                          paddingBottom: 10,
                          minHeight: 128,
                        }}
                      >
                        <TextInput
                          value={prompt}
                          onChangeText={(value) => {
                            setPrompt(value.slice(0, MAX_PROMPT));
                            if (localError) setLocalError(null);
                          }}
                          placeholder={copy.placeholder}
                          placeholderTextColor="#94A3B8"
                          multiline
                          textAlignVertical="top"
                          style={{
                            flex: 1,
                            minHeight: 88,
                            fontSize: 14,
                            lineHeight: 20,
                            color: "#0F172A",
                            padding: 0,
                          }}
                          maxLength={MAX_PROMPT}
                          testID="seneca-goal-prompt"
                        />
                        <Text
                          style={{
                            marginTop: 8,
                            fontSize: 11,
                            fontWeight: "600",
                            color: "#94A3B8",
                          }}
                        >
                          {prompt.length} / {MAX_PROMPT}
                        </Text>
                      </View>
                    </View>

                    <View style={{ gap: 10 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: "#334155",
                        }}
                      >
                        Need inspiration?
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {INSPIRATION.map(({ id, label, Icon }) => {
                          const selected =
                            prompt.trim().toLowerCase() === label.toLowerCase();
                          return (
                            <Pressable
                              key={id}
                              onPress={() => {
                                setPrompt(label);
                                setLocalError(null);
                              }}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                paddingHorizontal: 12,
                                paddingVertical: 9,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: selected ? "#C4B5FD" : "#E2E8F0",
                                backgroundColor: selected ? "#F5F3FF" : "#FFFFFF",
                              }}
                            >
                              <Icon
                                size={14}
                                color={selected ? "#6D28D9" : "#64748B"}
                                strokeWidth={2.2}
                              />
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "700",
                                  color: selected ? "#5B21B6" : "#334155",
                                }}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: "#334155",
                          }}
                        >
                          Due date
                        </Text>
                        <Pressable
                          onPress={() => setShowDatePicker((v) => !v)}
                          style={{
                            minHeight: 42,
                            borderRadius: 11,
                            borderWidth: 1,
                            borderColor: "#E2E8F0",
                            backgroundColor: "#FFFFFF",
                            paddingHorizontal: 10,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Calendar size={14} color="#64748B" />
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: "#0F172A",
                            }}
                          >
                            {formatGoalDueDate(dueDate)}
                          </Text>
                        </Pressable>
                      </View>

                      <View style={{ flex: 1.2, gap: 6 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: "#334155",
                          }}
                        >
                          Priority
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            borderRadius: 11,
                            borderWidth: 1,
                            borderColor: "#E2E8F0",
                            overflow: "hidden",
                            backgroundColor: "#FFFFFF",
                          }}
                        >
                          {PRIORITIES.map((item) => {
                            const selected = priority === item;
                            return (
                              <Pressable
                                key={item}
                                onPress={() => setPriority(item)}
                                style={{
                                  flex: 1,
                                  minHeight: 42,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: selected
                                    ? "#F5F3FF"
                                    : "#FFFFFF",
                                  borderRightWidth:
                                    item === "high" ? 0 : StyleSheet.hairlineWidth,
                                  borderRightColor: "#E2E8F0",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: "800",
                                    color: selected ? "#5B21B6" : "#64748B",
                                    textTransform: "capitalize",
                                  }}
                                >
                                  {item}
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
                        borderRadius: 16,
                        paddingHorizontal: 14,
                        paddingVertical: 14,
                        backgroundColor: "#F8F6FF",
                        borderWidth: 1,
                        borderColor: "#EDE9FE",
                        gap: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "800",
                          color: "#5B21B6",
                          letterSpacing: 0.2,
                        }}
                      >
                        How it works
                      </Text>
                      {HOW_IT_WORKS.map((step, index) => (
                        <View
                          key={step.title}
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: 10,
                          }}
                        >
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              backgroundColor: "#EDE9FE",
                              alignItems: "center",
                              justifyContent: "center",
                              marginTop: 1,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "800",
                                color: "#6D28D9",
                              }}
                            >
                              {index + 1}
                            </Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "800",
                                color: "#312E81",
                              }}
                            >
                              {step.title}
                            </Text>
                            <Text
                              style={{
                                marginTop: 2,
                                fontSize: 12,
                                lineHeight: 16,
                                color: "#64748B",
                              }}
                            >
                              {step.body}
                            </Text>
                          </View>
                          {index < HOW_IT_WORKS.length - 1 ? (
                            <ArrowRight
                              size={14}
                              color="#C4B5FD"
                              style={{ marginTop: 4 }}
                            />
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    {displayError ? (
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: "#DC2626",
                        }}
                      >
                        {displayError}
                      </Text>
                    ) : null}

                    <View style={{ gap: 8 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "800",
                          color: "#0F172A",
                        }}
                      >
                        Skill / goal title
                      </Text>
                      <TextInput
                        value={skill}
                        onChangeText={setSkill}
                        placeholder="Skill title"
                        placeholderTextColor="#94A3B8"
                        style={{
                          borderWidth: 1,
                          borderColor: "#E2E8F0",
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 11,
                          fontSize: 14,
                          fontWeight: "600",
                          color: "#0F172A",
                          backgroundColor: "#FFFFFF",
                        }}
                      />
                    </View>

                    <View style={{ gap: 8 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "800",
                          color: "#0F172A",
                        }}
                      >
                        Actions
                      </Text>
                      {steps.map((step, index) => (
                        <View
                          key={`review-step-${index}`}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            borderWidth: 1,
                            borderColor: "#E2E8F0",
                            borderRadius: 12,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            backgroundColor: "#FFFFFF",
                          }}
                        >
                          <TextInput
                            value={step}
                            onChangeText={(value) =>
                              setSteps((current) =>
                                current.map((s, i) => (i === index ? value : s)),
                              )
                            }
                            placeholder={`Action ${index + 1}`}
                            placeholderTextColor="#94A3B8"
                            style={{
                              flex: 1,
                              fontSize: 13,
                              color: "#0F172A",
                              paddingVertical: 4,
                            }}
                          />
                          {steps.length > 1 ? (
                            <Pressable
                              onPress={() =>
                                setSteps((current) =>
                                  current.filter((_, i) => i !== index),
                                )
                              }
                              hitSlop={8}
                            >
                              <Trash2 size={14} color="#F87171" />
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      {steps.length < MAX_STEPS ? (
                        <Pressable
                          onPress={() => setSteps((current) => [...current, ""])}
                          style={{
                            borderWidth: 1,
                            borderColor: "#E2E8F0",
                            borderRadius: 12,
                            paddingVertical: 10,
                            alignItems: "center",
                            backgroundColor: "#FAFBFF",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: "#4361EE",
                            }}
                          >
                            + Add action
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: "#334155",
                          }}
                        >
                          Due date
                        </Text>
                        <Pressable
                          onPress={() => setShowDatePicker((v) => !v)}
                          style={{
                            minHeight: 42,
                            borderRadius: 11,
                            borderWidth: 1,
                            borderColor: "#E2E8F0",
                            paddingHorizontal: 10,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Calendar size={14} color="#64748B" />
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: "#0F172A",
                            }}
                          >
                            {formatGoalDueDate(dueDate)}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={{ flex: 1.2, gap: 6 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: "#334155",
                          }}
                        >
                          Priority
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            borderRadius: 11,
                            borderWidth: 1,
                            borderColor: "#E2E8F0",
                            overflow: "hidden",
                          }}
                        >
                          {PRIORITIES.map((item) => {
                            const selected = priority === item;
                            return (
                              <Pressable
                                key={item}
                                onPress={() => setPriority(item)}
                                style={{
                                  flex: 1,
                                  minHeight: 42,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: selected
                                    ? "#F5F3FF"
                                    : "#FFFFFF",
                                  borderRightWidth:
                                    item === "high" ? 0 : StyleSheet.hairlineWidth,
                                  borderRightColor: "#E2E8F0",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: "800",
                                    color: selected ? "#5B21B6" : "#64748B",
                                    textTransform: "capitalize",
                                  }}
                                >
                                  {item}
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
                  </>
                )}
              </ScrollView>

              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 10,
                  paddingBottom: 8,
                  borderTopWidth: 1,
                  borderTopColor: "#EEF2F6",
                  gap: 8,
                }}
              >
                {phase === "prompt" ? (
                  <Pressable
                    onPress={() => void generate()}
                    disabled={!prompt.trim()}
                    style={{
                      minHeight: 50,
                      borderRadius: 14,
                      backgroundColor: prompt.trim()
                        ? colors.brand
                        : "#C4B5FD",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 8,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Generate development plan"
                    testID="seneca-generate-plan"
                  >
                    <Sparkles size={16} color="#FFFFFF" strokeWidth={2.4} />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "800",
                        color: "#FFFFFF",
                      }}
                    >
                      Generate development plan
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() => {
                        setPhase("prompt");
                        setLocalError(null);
                      }}
                      disabled={saving}
                      style={{
                        flex: 1,
                        minHeight: 48,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#FFFFFF",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: "#334155",
                        }}
                      >
                        Back
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCreate}
                      disabled={saving}
                      style={{
                        flex: 1.4,
                        minHeight: 48,
                        borderRadius: 14,
                        backgroundColor: saving ? "#A5B4FC" : colors.brand,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 8,
                      }}
                      testID="seneca-create-goal"
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : null}
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "800",
                          color: "#FFFFFF",
                        }}
                      >
                        Create goal
                      </Text>
                    </Pressable>
                  </View>
                )}

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <SenecaIcon size={18} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: "#8A96A8",
                    }}
                  >
                    Powered by Seneca • Review before creating
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
