import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { setStatusBarStyle } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Eye,
  GripVertical,
  Layers,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import { api, ApiError } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import {
  createCheckInTemplate,
  deleteCheckInTemplate,
  fetchCheckInTemplates,
  updateCheckInTemplate,
} from "@/lib/check-in-templates-api";
import {
  buildCheckInTemplatePayload,
  CHECK_IN_TEMPLATE_MAX_PREP_ITEMS,
  createEmptyQuestion,
  createEmptySection,
  createEmptyTemplateDraft,
  duplicateSection,
  moveItem,
  templateToDraft,
  validateCheckInTemplateDraft,
  type CheckInTemplateDraft,
  type CheckInTemplateQuestion,
  type EditableCheckInQuestionType,
} from "@/lib/check-in-template-editor";
import { useTeamStore } from "@/lib/state/team-store";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { canManageWorkspace } from "@/lib/workspace-management";
import { AppHeaderBand } from "@/components/AppHeaderBand";
import { palette } from "@/theme";

const BAND_SHEET_RADIUS = 24;
const HEADER_ROW = 48;

type SelectedQuestion = { sectionIndex: number; questionIndex: number };
type ConfirmMode = "leave" | "delete" | null;
type CreateStep = 1 | 2 | 3;

const CREATE_DESCRIPTION_LIMIT = 220;

const CREATE_STEPS: {
  step: CreateStep;
  title: string;
  short: string;
  intro: string;
}[] = [
  {
    step: 1,
    title: "Template details",
    short: "Details",
    intro: "Give your conversation a clear name and context.",
  },
  {
    step: 2,
    title: "Leader preparation",
    short: "Leader Prep",
    intro: `Add up to ${CHECK_IN_TEMPLATE_MAX_PREP_ITEMS} prompts to help leaders prepare. Only leaders can see these notes.`,
  },
  {
    step: 3,
    title: "Sections & questions",
    short: "Questions",
    intro: "Build the conversation by adding sections and questions.",
  },
];

class QuietValidationError extends Error {
  readonly quiet = true;
}

function answerKind(type: string): string {
  if (type === "yes_no") return "Yes or no";
  if (type === "rating") return "Rating";
  if (type === "short_text") return "Short answer";
  return "Open response";
}

function CreateStepper({ step }: { step: CreateStep }) {
  return (
    <View style={styles.stepper} testID="check-in-template-create-progress">
      {CREATE_STEPS.map((item, index) => {
        const done = item.step < step;
        const active = item.step === step;
        return (
          <View key={item.step} style={styles.stepperItem}>
            <View style={styles.stepperTrack}>
              {index > 0 ? (
                <View
                  style={[
                    styles.stepperLine,
                    styles.stepperLineLeft,
                    item.step <= step ? styles.stepperLineOn : null,
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.stepperDot,
                  active ? styles.stepperDotOn : null,
                  done ? styles.stepperDotDone : null,
                ]}
              >
                {done ? (
                  <Check size={14} color="#FFFFFF" strokeWidth={3} />
                ) : (
                  <Text
                    style={[
                      styles.stepperNumber,
                      active ? styles.stepperNumberOn : null,
                    ]}
                  >
                    {item.step}
                  </Text>
                )}
              </View>
              {index < CREATE_STEPS.length - 1 ? (
                <View
                  style={[
                    styles.stepperLine,
                    styles.stepperLineRight,
                    item.step < step ? styles.stepperLineOn : null,
                  ]}
                />
              ) : null}
            </View>
            <Text
              style={[
                styles.stepperLabel,
                active ? styles.stepperLabelOn : null,
              ]}
            >
              {item.short}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ReorderDragHandle({
  canMoveUp,
  canMoveDown,
  onMove,
  compact = false,
  accessibilityLabel,
  testID,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
  compact?: boolean;
  accessibilityLabel: string;
  testID?: string;
}) {
  const translateY = useSharedValue(0);
  const active = useSharedValue(false);
  const dragGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onStart(() => {
      active.value = true;
    })
    .onUpdate((event) => {
      translateY.value = Math.max(-42, Math.min(42, event.translationY));
    })
    .onEnd((event) => {
      if (event.translationY < -24 && canMoveUp) {
        runOnJS(onMove)("up");
      } else if (event.translationY > 24 && canMoveDown) {
        runOnJS(onMove)("down");
      }
    })
    .onFinalize(() => {
      active.value = false;
      translateY.value = withSpring(0, { damping: 18, stiffness: 240 });
    });
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: active.value ? 0.72 : 1,
  }));

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View
        style={[
          compact ? styles.questionDragHandle : styles.sectionDragHandle,
          animatedStyle,
        ]}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        <GripVertical
          size={compact ? 15 : 16}
          color="#C5CDD8"
          strokeWidth={2.1}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const QUESTION_TYPES: {
  value: EditableCheckInQuestionType;
  label: string;
  description: string;
}[] = [
  {
    value: "short_text",
    label: "Short text",
    description: "A concise response",
  },
  {
    value: "long_text",
    label: "Long text",
    description: "A thoughtful written response",
  },
  {
    value: "rating",
    label: "Rating",
    description: "Choose a number on a scale",
  },
  { value: "yes_no", label: "Yes / No", description: "A simple binary choice" },
];

function stableDraft(draft: CheckInTemplateDraft): string {
  return JSON.stringify(draft);
}

export default function CheckInTemplateEditorScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    teamId?: string;
    templateId?: string;
  }>();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const teamId =
    (typeof params.teamId === "string" && params.teamId) || activeTeamId || "";
  const templateId =
    typeof params.templateId === "string" ? params.templateId : undefined;
  const { access, isLoading: accessLoading } = useWorkspaceAccess(teamId);
  const [draft, setDraft] = useState<CheckInTemplateDraft>(() =>
    createEmptyTemplateDraft(),
  );
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [selectedQuestion, setSelectedQuestion] =
    useState<SelectedQuestion | null>(null);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [deleteBlock, setDeleteBlock] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [allowNavigation, setAllowNavigation] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<
    (() => void) | null
  >(null);
  const [createStep, setCreateStep] = useState<CreateStep>(1);
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(
    null,
  );
  const [sectionTitleDraft, setSectionTitleDraft] = useState("");
  const [sectionMenuIndex, setSectionMenuIndex] = useState<number | null>(null);
  const sectionTitleRef = useRef("");
  const formScrollRef = useRef<ScrollView>(null);
  const isCreating = !templateId;
  const bandHeight = insets.top + HEADER_ROW + 22;

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, []),
  );

  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: Boolean(teamId),
  });
  const role = teamQuery.data?.role?.toLowerCase() ?? "";
  const canManage = canManageWorkspace(role);

  const templatesQuery = useQuery({
    queryKey: ["one-on-one-templates", teamId],
    queryFn: () => fetchCheckInTemplates(teamId),
    enabled: Boolean(teamId && canManage && templateId),
  });
  const editingTemplate = templateId
    ? templatesQuery.data?.find((template) => template.id === templateId)
    : undefined;
  const templateMissing = Boolean(
    templateId && templatesQuery.data && !editingTemplate,
  );

  useEffect(() => {
    if (initialized) return;
    if (templateId && templatesQuery.isLoading) return;
    if (templateId && !editingTemplate) return;
    const next = editingTemplate
      ? templateToDraft(editingTemplate)
      : createEmptyTemplateDraft();
    setDraft(next);
    setInitialSnapshot(stableDraft(next));
    setInitialized(true);
  }, [editingTemplate, initialized, templateId, templatesQuery.isLoading]);

  const dirty = initialized && stableDraft(draft) !== initialSnapshot;

  usePreventRemove(dirty && !allowNavigation, ({ data }) => {
    if (isCreating && createStep > 1) {
      setValidationErrors([]);
      setPreviewing(false);
      setCreateStep((createStep - 1) as CreateStep);
      return;
    }
    setPendingNavigation(() => () => data.action && router.back());
    setConfirmMode("leave");
  });

  const navigateBack = () => {
    if (isCreating && createStep > 1) {
      setValidationErrors([]);
      setPreviewing(false);
      setCreateStep((createStep - 1) as CreateStep);
      return;
    }
    if (dirty && !allowNavigation) {
      setPendingNavigation(() => () => router.back());
      setConfirmMode("leave");
      return;
    }
    router.back();
  };

  const validateCreateStep = (step: CreateStep): string[] => {
    if (step === 1) {
      const errors: string[] = [];
      if (!draft.title.trim())
        errors.push("Enter a template name to continue.");
      if (draft.title.trim().length > 120) {
        errors.push("Template name must be 120 characters or fewer.");
      }
      if (draft.description.trim().length > 500) {
        errors.push("Description must be 500 characters or fewer.");
      }
      return errors;
    }
    if (step === 2) {
      const errors: string[] = [];
      if (draft.leaderPrep.length > CHECK_IN_TEMPLATE_MAX_PREP_ITEMS) {
        errors.push(
          `Add no more than ${CHECK_IN_TEMPLATE_MAX_PREP_ITEMS} prep reminders.`,
        );
      }
      draft.leaderPrep.forEach((item, index) => {
        if (!item.trim())
          errors.push(`Prep reminder ${index + 1} cannot be empty.`);
        if (item.trim().length > 200) {
          errors.push(
            `Prep reminder ${index + 1} must be 200 characters or fewer.`,
          );
        }
      });
      return errors;
    }
    const errors: string[] = [];
    if (draft.sections.length === 0) errors.push("Add at least one section.");
    let questionCount = 0;
    draft.sections.forEach((section, sectionIndex) => {
      if (!section.title.trim())
        errors.push(`Section ${sectionIndex + 1} needs a title.`);
      section.questions.forEach((item) => {
        questionCount += 1;
        if (!item.label.trim()) {
          errors.push(
            `Every question in section ${sectionIndex + 1} needs a label.`,
          );
        }
        if (
          item.type === "rating" &&
          (item.ratingMax < 2 || item.ratingMax > 10)
        ) {
          errors.push("Rating maximum must be between 2 and 10.");
        }
      });
    });
    if (questionCount === 0) errors.push("Add at least one question.");
    return errors;
  };

  const continueCreate = () => {
    const errors = validateCreateStep(createStep);
    setPreviewing(false);
    setValidationErrors(errors);
    if (errors.length > 0) return;
    setCreateStep((createStep + 1) as CreateStep);
  };

  const openPlan = () =>
    router.push({ pathname: "/choose-plan", params: { teamId } });

  const invalidateSharedData = () => {
    void queryClient.invalidateQueries({
      queryKey: ["one-on-one-templates", teamId],
    });
    void queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!access.canWrite) {
        openPlan();
        throw new Error("Choose a plan to edit this workspace.");
      }
      const validation = validateCheckInTemplateDraft(draft);
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        throw new QuietValidationError("Review the template fields.");
      }
      const payload = buildCheckInTemplatePayload(draft);
      return templateId
        ? updateCheckInTemplate(teamId, templateId, payload)
        : createCheckInTemplate(teamId, payload);
    },
    onSuccess: () => {
      invalidateSharedData();
      setAllowNavigation(true);
      toast({
        title: templateId ? "Template updated" : "Template created",
        preset: "done",
      });
      setTimeout(() => router.back(), 0);
    },
    onError: (error: Error) => {
      if (error instanceof QuietValidationError) return;
      toast({
        title: "Could not save template",
        message: error.message,
        preset: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!templateId) throw new Error("Template not found.");
      if (!access.canWrite) {
        openPlan();
        throw new Error("Choose a plan to edit this workspace.");
      }
      return deleteCheckInTemplate(teamId, templateId);
    },
    onSuccess: () => {
      invalidateSharedData();
      setAllowNavigation(true);
      setConfirmMode(null);
      setDeleteBlock(null);
      toast({ title: "Template deleted", preset: "done" });
      setTimeout(() => router.back(), 0);
    },
    onError: (error: Error) => {
      const code =
        error instanceof ApiError ? error.body?.error?.code : undefined;
      setDeleteBlock(
        code === "TEMPLATE_REQUIRED_BY_WORKSPACE_STANDARDS"
          ? "This template is currently required by Workspace Standards. Choose “Any template” or another required template before deleting it."
          : code === "TEMPLATE_HAS_FUTURE_CHECK_INS"
            ? "This template is used by a future check-in. Reschedule, hide, reject, or remove those check-ins before deleting it."
            : error.message || "The template could not be deleted.",
      );
    },
  });

  const question = useMemo(() => {
    if (!selectedQuestion) return null;
    return (
      draft.sections[selectedQuestion.sectionIndex]?.questions[
        selectedQuestion.questionIndex
      ] ?? null
    );
  }, [draft.sections, selectedQuestion]);

  const updateQuestion = (patch: Partial<CheckInTemplateQuestion>) => {
    if (!selectedQuestion) return;
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) =>
        sectionIndex === selectedQuestion.sectionIndex
          ? {
              ...section,
              questions: section.questions.map((item, questionIndex) =>
                questionIndex === selectedQuestion.questionIndex
                  ? { ...item, ...patch }
                  : item,
              ),
            }
          : section,
      ),
    }));
  };

  const deleteSelectedQuestion = () => {
    if (!selectedQuestion) return;
    const { sectionIndex, questionIndex } = selectedQuestion;
    Alert.alert(
      "Delete question?",
      "This question will be removed from the template when you save your changes.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setDraft((current) => ({
              ...current,
              sections: current.sections.map((section, index) =>
                index === sectionIndex
                  ? {
                      ...section,
                      questions: section.questions.filter(
                        (_, indexToCheck) => indexToCheck !== questionIndex,
                      ),
                    }
                  : section,
              ),
            }));
            setSelectedQuestion(null);
          },
        },
      ],
    );
  };

  const addQuestion = (sectionIndex: number) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              questions: [...section.questions, createEmptyQuestion()],
            }
          : section,
      ),
    }));
    const questionIndex = draft.sections[sectionIndex]?.questions.length ?? 0;
    setSelectedQuestion({ sectionIndex, questionIndex });
  };

  const mutateSection = (
    sectionIndex: number,
    action: "duplicate" | "up" | "down" | "delete",
  ) => {
    setDraft((current) => {
      if (action === "duplicate") {
        const sections = [...current.sections];
        const section = sections[sectionIndex];
        if (section)
          sections.splice(sectionIndex + 1, 0, duplicateSection(section));
        return { ...current, sections };
      }
      if (action === "delete") {
        return {
          ...current,
          sections: current.sections.filter(
            (_, index) => index !== sectionIndex,
          ),
        };
      }
      return {
        ...current,
        sections: moveItem(
          current.sections,
          sectionIndex,
          action === "up" ? sectionIndex - 1 : sectionIndex + 1,
        ),
      };
    });
  };

  const beginSectionTitleEdit = (sectionIndex: number) => {
    const currentTitle = draft.sections[sectionIndex]?.title ?? "";
    sectionTitleRef.current = currentTitle;
    setSectionTitleDraft(currentTitle);
    setEditingSectionIndex(sectionIndex);
  };

  const commitSectionTitle = (sectionIndex: number) => {
    const nextTitle = sectionTitleRef.current.trim();
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, index) =>
        index === sectionIndex ? { ...section, title: nextTitle } : section,
      ),
    }));
    setEditingSectionIndex((current) =>
      current === sectionIndex ? null : current,
    );
  };

  const requestDeleteSection = (sectionIndex: number) => {
    setSectionMenuIndex(null);
    const section = draft.sections[sectionIndex];
    const remove = () => {
      if (editingSectionIndex === sectionIndex) setEditingSectionIndex(null);
      mutateSection(sectionIndex, "delete");
    };
    if (section && section.questions.length > 0) {
      Alert.alert(
        "Delete section?",
        "This section and its questions will be removed from the template.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: remove },
        ],
      );
      return;
    }
    remove();
  };

  const nameNeedsAttention = validationErrors.some(
    (error) =>
      error === "Enter a template name to continue." ||
      error === "Template name is required." ||
      error === "Template name must be 120 characters or fewer.",
  );
  const shownValidationErrors = validationErrors.filter((error) => {
    if (
      isCreating &&
      createStep === 1 &&
      (error === "Enter a template name to continue." ||
        error === "Template name must be 120 characters or fewer.")
    ) {
      return false;
    }
    if (/^Section \d+ needs a title\.$/.test(error)) return false;
    if (/^Every question in section \d+ needs a label\.$/.test(error)) {
      return false;
    }
    return true;
  });
  const showFieldErrors = validationErrors.length > 0;

  const renderPreview = () => (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 100 },
      ]}
      testID="check-in-template-editor-preview"
    >
      <View style={styles.previewHero}>
        <Text style={styles.previewTitle}>
          {draft.title.trim() || "Untitled template"}
        </Text>
        {draft.description.trim() ? (
          <Text style={styles.previewDescription}>
            {draft.description.trim()}
          </Text>
        ) : null}
      </View>
      {draft.leaderPrep.some((item) => item.trim()) ? (
        <View style={styles.prepPreview}>
          <Text style={styles.sectionEyebrow}>BEFORE YOU BEGIN</Text>
          <Text style={styles.sectionTitle}>Leader prep</Text>
          {draft.leaderPrep.map((item, index) =>
            item.trim() ? (
              <Text key={`${item}-${index}`} style={styles.prepPreviewItem}>
                {index + 1}. {item.trim()}
              </Text>
            ) : null,
          )}
        </View>
      ) : null}
      {draft.sections.map((section) => (
        <View key={section.id} style={styles.previewSection}>
          <Text style={styles.sectionTitle}>
            {section.title.trim() || "Untitled section"}
          </Text>
          {section.questions.map((item, index) => (
            <View key={item.id} style={styles.previewQuestion}>
              <View style={styles.questionNumber}>
                <Text style={styles.questionNumberText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.questionLabel}>
                  {item.label.trim() || "Untitled question"}
                  {item.required ? (
                    <Text style={{ color: "#EF4444" }}> *</Text>
                  ) : null}
                </Text>
                {item.helpText.trim() ? (
                  <Text style={styles.questionHelp}>
                    {item.helpText.trim()}
                  </Text>
                ) : null}
                <View style={styles.previewInput}>
                  <Text style={styles.previewInputText}>
                    {item.type === "rating"
                      ? `Rating from 1 to ${item.ratingMax}`
                      : item.type === "yes_no"
                        ? "Yes  /  No"
                        : item.type === "long_text"
                          ? "Long response"
                          : "Short response"}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );

  const renderEditor = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={52}
    >
      <ScrollView
        ref={formScrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 132 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="check-in-template-editor-form"
      >
        {!access.canWrite ? (
          <Pressable
            onPress={openPlan}
            style={styles.readOnlyBanner}
            accessibilityRole="button"
            testID="check-in-template-editor-read-only"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.readOnlyTitle}>Workspace is read-only</Text>
              <Text style={styles.readOnlyBody}>
                Choose a plan to save template changes.
              </Text>
            </View>
            <ChevronRight size={18} color="#92400E" />
          </Pressable>
        ) : null}

        {isCreating ? (
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: 3, now: createStep }}
            accessibilityLabel={`Step ${createStep} of 3: ${CREATE_STEPS[createStep - 1]?.title}`}
          >
            <CreateStepper step={createStep} />
            <Text style={styles.stepCount}>Step {createStep} of 3</Text>
            <Text style={styles.stepTitle}>
              {CREATE_STEPS[createStep - 1]?.title}
            </Text>
            <Text style={styles.stepIntro}>
              {CREATE_STEPS[createStep - 1]?.intro}
            </Text>
          </View>
        ) : null}

        {shownValidationErrors.length > 0 ? (
          <View
            style={styles.validationCard}
            testID="check-in-template-validation-errors"
          >
            <Text style={styles.validationTitle}>
              {isCreating && createStep < 3
                ? "Before you continue"
                : "Review this template"}
            </Text>
            {shownValidationErrors.slice(0, 4).map((error) => (
              <Text key={error} style={styles.validationText}>
                • {error}
              </Text>
            ))}
          </View>
        ) : null}

        {!isCreating || createStep === 1 ? (
          <View style={styles.formCard}>
            {isCreating ? null : (
              <Text style={styles.sectionEyebrow}>Template details</Text>
            )}
            <Text style={styles.fieldLabel}>
              {isCreating ? "Template name *" : "Name *"}
            </Text>
            <TextInput
              value={draft.title}
              onChangeText={(title) => {
                setDraft((current) => ({ ...current, title }));
                setValidationErrors([]);
              }}
              placeholder="Weekly coaching check-in"
              placeholderTextColor="#A0A8B5"
              maxLength={120}
              style={[
                styles.input,
                nameNeedsAttention ? styles.inputInvalid : null,
              ]}
              accessibilityLabel="Template name"
              testID="check-in-template-name-input"
            />
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              value={draft.description}
              onChangeText={(description) =>
                setDraft((current) => ({ ...current, description }))
              }
              placeholder={
                isCreating
                  ? "What is this conversation for?"
                  : "When leaders should use this conversation"
              }
              placeholderTextColor="#A0A8B5"
              maxLength={isCreating ? CREATE_DESCRIPTION_LIMIT : 500}
              multiline
              style={[styles.input, styles.textarea]}
              accessibilityLabel="Template description"
              testID="check-in-template-description-input"
            />
            {isCreating ? (
              <Text style={styles.charCount}>
                {draft.description.length}/{CREATE_DESCRIPTION_LIMIT}
              </Text>
            ) : null}
          </View>
        ) : null}
        {isCreating && createStep === 1 ? (
          <View style={styles.detailsArt} accessibilityElementsHidden>
            <View style={styles.detailsArtBlob} />
            <View style={styles.detailsArtCard}>
              <View style={styles.detailsArtRow}>
                <View style={styles.detailsArtBox} />
                <View style={styles.detailsArtLine} />
              </View>
              <View style={styles.detailsArtRow}>
                <View style={[styles.detailsArtBox, styles.detailsArtBoxOn]} />
                <View style={[styles.detailsArtLine, { width: 54 }]} />
              </View>
              <View style={styles.detailsArtRow}>
                <View style={styles.detailsArtBox} />
                <View style={[styles.detailsArtLine, { width: 40 }]} />
              </View>
            </View>
          </View>
        ) : null}

        {!isCreating || createStep === 2 ? (
          <>
          <View style={styles.formCard}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Private leader prep</Text>
                <Text style={styles.sectionHint}>
                  These reminders are for leaders only.
                </Text>
              </View>
              <Text style={styles.countBadge}>
                {draft.leaderPrep.length}/{CHECK_IN_TEMPLATE_MAX_PREP_ITEMS}
              </Text>
            </View>
            {draft.leaderPrep.map((item, index) => (
              <View key={index} style={styles.prepRow}>
                <GripVertical size={16} color="#C4C0D4" strokeWidth={2.2} />
                <TextInput
                  value={item}
                  onChangeText={(value) =>
                    setDraft((current) => ({
                      ...current,
                      leaderPrep: current.leaderPrep.map((prep, prepIndex) =>
                        prepIndex === index ? value : prep,
                      ),
                    }))
                  }
                  placeholder="Review recent goals and follow-ups"
                  placeholderTextColor="#A0A8B5"
                  maxLength={200}
                  style={[styles.input, { flex: 1 }]}
                  accessibilityLabel={`Leader prep item ${index + 1}`}
                  testID={`leader-prep-input-${index}`}
                />
                <Pressable
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      leaderPrep: current.leaderPrep.filter(
                        (_, prepIndex) => prepIndex !== index,
                      ),
                    }))
                  }
                  style={styles.iconButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete leader prep item ${index + 1}`}
                  testID={`delete-leader-prep-${index}`}
                >
                  <X size={15} color="#98A2B3" strokeWidth={2.2} />
                </Pressable>
              </View>
            ))}
          </View>
            {draft.leaderPrep.length < CHECK_IN_TEMPLATE_MAX_PREP_ITEMS ? (
              <Pressable
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    leaderPrep: [...current.leaderPrep, ""],
                  }))
                }
                style={styles.addOutlineButton}
                accessibilityRole="button"
                testID="add-leader-prep"
              >
                <Plus size={15} color={"#6D4AFF"} />
                <Text style={styles.addOutlineText}>Add prep reminder</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {!isCreating || createStep === 3 ? (
          <>
            {isCreating ? null : (
              <View style={styles.sectionsHeading}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Sections & questions</Text>
                </View>
                <Text style={styles.countBadge}>
                  {draft.sections.reduce(
                    (count, section) => count + section.questions.length,
                    0,
                  )}{" "}
                  questions
                </Text>
              </View>
            )}

            {draft.sections.map((section, sectionIndex) => {
              const editingTitle = editingSectionIndex === sectionIndex;
              const questionCount = section.questions.length;
              const sectionTitleMissing =
                showFieldErrors &&
                !(editingTitle ? sectionTitleDraft : section.title).trim();
              return (
              <View
                key={section.id}
                style={styles.sectionCard}
                testID={`check-in-template-section-${sectionIndex}`}
              >
                <View style={styles.sectionCardHeader}>
                  <View style={styles.sectionIcon}>
                    <Layers size={16} color="#6D4AFF" strokeWidth={2.2} />
                  </View>
                  <View style={styles.sectionIdentity}>
                    <Text style={styles.sectionIndexLabel}>
                      SECTION {sectionIndex + 1}
                    </Text>
                    {editingTitle ? (
                      <TextInput
                        value={sectionTitleDraft}
                        onChangeText={(value) => {
                          sectionTitleRef.current = value;
                          setSectionTitleDraft(value);
                        }}
                        onBlur={() => commitSectionTitle(sectionIndex)}
                        onSubmitEditing={() => commitSectionTitle(sectionIndex)}
                        placeholder="Section title"
                        placeholderTextColor="#A0A8B5"
                        maxLength={200}
                        autoFocus
                        returnKeyType="done"
                        style={[
                          styles.sectionTitleEditor,
                          sectionTitleMissing ? styles.inlineInvalid : null,
                        ]}
                        accessibilityLabel={`Section ${sectionIndex + 1} title`}
                        testID={`section-title-input-${sectionIndex}`}
                      />
                    ) : (
                      <Pressable
                        onPress={() => beginSectionTitleEdit(sectionIndex)}
                        style={[
                          styles.sectionTitleRow,
                          sectionTitleMissing ? styles.inlineInvalid : null,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit section ${sectionIndex + 1} title`}
                        testID={`section-title-input-${sectionIndex}`}
                      >
                        <Text style={styles.sectionDisplayTitle} numberOfLines={1}>
                          {section.title.trim() || "Untitled section"}
                        </Text>
                        <Pencil size={14} color="#6D4AFF" strokeWidth={2.2} />
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.sectionCountBadge}>
                    <Text style={styles.sectionCountText} numberOfLines={1}>
                      {questionCount} question{questionCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      if (editingSectionIndex !== null) {
                        commitSectionTitle(editingSectionIndex);
                      }
                      setSectionMenuIndex(sectionIndex);
                    }}
                    hitSlop={8}
                    style={styles.sectionMenuButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Section ${sectionIndex + 1} actions`}
                    testID={`section-menu-${sectionIndex}`}
                  >
                    <MoreHorizontal size={18} color="#667085" strokeWidth={2.2} />
                  </Pressable>
                </View>
                <View>
                  {section.questions.map((item, questionIndex) => (
                    <Pressable
                      key={item.id}
                      onPress={() =>
                        setSelectedQuestion({ sectionIndex, questionIndex })
                      }
                      style={[
                        styles.questionRow,
                        showFieldErrors && !item.label.trim()
                          ? styles.questionRowInvalid
                          : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.label || `question ${questionIndex + 1}`}`}
                      testID={`edit-question-${sectionIndex}-${questionIndex}`}
                    >
                      <ReorderDragHandle
                        compact
                        canMoveUp={questionIndex > 0}
                        canMoveDown={
                          questionIndex < section.questions.length - 1
                        }
                        onMove={(direction) =>
                          setDraft((current) => ({
                            ...current,
                            sections: current.sections.map(
                              (currentSection, currentSectionIndex) =>
                                currentSectionIndex === sectionIndex
                                  ? {
                                      ...currentSection,
                                      questions: moveItem(
                                        currentSection.questions,
                                        questionIndex,
                                        direction === "up"
                                          ? questionIndex - 1
                                          : questionIndex + 1,
                                      ),
                                    }
                                  : currentSection,
                            ),
                          }))
                        }
                        accessibilityLabel={`Drag question ${questionIndex + 1} to reorder`}
                        testID={`question-drag-handle-${sectionIndex}-${questionIndex}`}
                      />
                      <View style={styles.questionNumber}>
                        <Text style={styles.questionNumberText}>
                          {questionIndex + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.questionLabel} numberOfLines={2}>
                          {item.label.trim() || "Untitled question"}
                          {item.required ? (
                            <Text style={{ color: "#EF4444" }}> *</Text>
                          ) : null}
                        </Text>
                        <Text style={styles.questionType}>
                          {answerKind(item.type)}
                          {item.type === "rating"
                            ? ` · 1–${item.ratingMax}`
                            : ""}
                        </Text>
                      </View>
                      <Pencil size={15} color="#6D4AFF" strokeWidth={2.2} />
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  onPress={() => addQuestion(sectionIndex)}
                  style={styles.addQuestionButton}
                  accessibilityRole="button"
                  testID={`add-question-${sectionIndex}`}
                >
                  <Plus size={15} color="#6D4AFF" strokeWidth={2.4} />
                  <Text style={styles.addQuestionText}>Add question</Text>
                </Pressable>
              </View>
              );
            })}

            <Pressable
              onPress={() => {
                const nextIndex = draft.sections.length;
                sectionTitleRef.current = "";
                setSectionTitleDraft("");
                setEditingSectionIndex(nextIndex);
                setDraft((current) => ({
                  ...current,
                  sections: [...current.sections, createEmptySection()],
                }));
                requestAnimationFrame(() => {
                  formScrollRef.current?.scrollToEnd({ animated: true });
                });
              }}
              style={styles.addSectionButton}
              accessibilityRole="button"
              accessibilityLabel="Add another section"
              testID="add-check-in-template-section"
            >
              <Plus size={16} color="#6D4AFF" strokeWidth={2.4} />
              <Text style={styles.addSectionText}>Add another section</Text>
            </Pressable>
          </>
        ) : null}

        {templateId ? (
          <Pressable
            onPress={() => {
              if (!access.canWrite) {
                openPlan();
                return;
              }
              setDeleteBlock(null);
              setConfirmMode("delete");
            }}
            style={styles.deleteTemplateButton}
            accessibilityRole="button"
            testID="delete-template-from-editor"
          >
            <Trash2 size={16} color="#EF4444" />
            <Text style={styles.deleteTemplateText}>Delete template</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (
    !teamId ||
    teamQuery.isLoading ||
    accessLoading ||
    (templateId && templatesQuery.isLoading)
  ) {
    return (
      <View style={styles.screen} testID="check-in-template-editor-loading">
        <AppHeaderBand height={bandHeight} />
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <View style={styles.topAction} />
          <View style={{ flex: 1 }} />
          <View style={styles.topAction} />
        </View>
        <View style={styles.pageSheet}>
          <View style={styles.center}>
            <ActivityIndicator color={palette.violet} />
            <Text style={styles.sectionHint}>Loading editor…</Text>
          </View>
        </View>
      </View>
    );
  }

  if (
    !canManage ||
    (templateId && (templatesQuery.isError || templateMissing))
  ) {
    return (
      <View style={styles.screen} testID="check-in-template-editor-error">
        <AppHeaderBand height={bandHeight} />
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <Pressable onPress={() => router.back()} style={styles.topAction}>
            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.topTitle}>Check-in template</Text>
          </View>
          <View style={styles.topAction} />
        </View>
        <View style={styles.pageSheet}>
          <View style={styles.center}>
            <Text style={styles.previewTitle}>
              {!canManage
                ? "Leader access required"
                : templateMissing
                  ? "Template not found"
                  : "Couldn’t load template"}
            </Text>
            <Text style={styles.sectionHint}>
              {templatesQuery.error instanceof Error
                ? templatesQuery.error.message
                : "Ask a workspace leader for access."}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="check-in-template-editor-screen">
      <AppHeaderBand height={bandHeight} />
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <Pressable
          onPress={navigateBack}
          style={styles.topAction}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="check-in-template-editor-back"
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.topTitle} numberOfLines={1}>
            {templateId ? "Edit template" : "Create a template"}
          </Text>
          <Text style={styles.topSubtitle} numberOfLines={1}>
            {templateId
              ? teamQuery.data?.name
              : "Build a reusable check-in conversation"}
          </Text>
        </View>
        {isCreating ? (
          <Pressable
            onPress={navigateBack}
            style={styles.topAction}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="check-in-template-editor-close"
          >
            <X size={18} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setPreviewing((value) => !value)}
            style={[styles.topAction, previewing ? styles.topActionActive : null]}
            accessibilityRole="button"
            accessibilityLabel={previewing ? "Show editor" : "Preview template"}
            testID="toggle-check-in-template-preview"
          >
            {previewing ? (
              <Pencil size={18} color="#FFFFFF" strokeWidth={2.2} />
            ) : (
              <Eye size={19} color="#FFFFFF" strokeWidth={2.2} />
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.pageSheet}>
      {previewing ? renderPreview() : renderEditor()}

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}
      >
        {isCreating ? (
          <Pressable
            onPress={() => {
              if (createStep === 1) {
                navigateBack();
                return;
              }
              setValidationErrors([]);
              setPreviewing(false);
              setCreateStep((createStep - 1) as CreateStep);
            }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={
              createStep === 1 ? "Go back" : `Back to step ${createStep - 1}`
            }
            testID="check-in-template-create-step-back"
          >
            <ArrowLeft size={16} color="#3F4658" />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setPreviewing((value) => !value)}
            style={styles.previewButton}
            accessibilityRole="button"
            testID="footer-toggle-check-in-template-preview"
          >
            {previewing ? (
              <Pencil size={16} color="#475569" />
            ) : (
              <Eye size={16} color="#475569" />
            )}
            <Text style={styles.previewButtonText}>
              {previewing ? "Edit" : "Preview"}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            if (isCreating && createStep < 3) {
              continueCreate();
              return;
            }
            setPreviewing(false);
            if (access.canWrite) {
              saveMutation.mutate();
            } else {
              openPlan();
            }
          }}
          disabled={saveMutation.isPending}
          style={[
            styles.saveButton,
            saveMutation.isPending ? styles.disabled : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            isCreating && createStep < 3
              ? `Continue to step ${createStep + 1}`
              : undefined
          }
          testID={
            isCreating && createStep < 3
              ? "check-in-template-create-continue"
              : "save-check-in-template"
          }
        >
          {saveMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              {isCreating ? null : <Save size={16} color="#FFFFFF" />}
              <Text style={styles.saveButtonText}>
                {isCreating && createStep < 3
                  ? "Continue"
                  : templateId
                    ? "Save changes"
                    : "Create template"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
      </View>

      <Modal
        visible={Boolean(selectedQuestion && question)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedQuestion(null)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setSelectedQuestion(null)}
        >
          <Pressable
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
            onPress={(event) => event.stopPropagation()}
            testID="question-editor-sheet"
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Question</Text>
                <Text style={styles.sectionHint}>
                  Customize what leaders will ask.
                </Text>
              </View>
              <Pressable
                onPress={() => setSelectedQuestion(null)}
                style={styles.iconButton}
                accessibilityLabel="Close question editor"
                testID="close-question-editor"
              >
                <X size={16} color="#64748B" />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <Text style={styles.fieldLabel}>Question label *</Text>
              <TextInput
                value={question?.label ?? ""}
                onChangeText={(label) => updateQuestion({ label })}
                placeholder="What would make next week successful?"
                placeholderTextColor="#A0A8B5"
                maxLength={200}
                multiline
                style={[
                  styles.input,
                  styles.textarea,
                  showFieldErrors && !question?.label.trim()
                    ? styles.inputInvalid
                    : null,
                ]}
                accessibilityLabel="Question label"
                testID="question-label-input"
              />
              <Text style={styles.fieldLabel}>Response type</Text>
              <View style={styles.typeGrid}>
                {QUESTION_TYPES.map((type) => {
                  const selected = question?.type === type.value;
                  return (
                    <Pressable
                      key={type.value}
                      onPress={() => updateQuestion({ type: type.value })}
                      style={[
                        styles.typeOption,
                        selected ? styles.typeOptionSelected : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      testID={`question-type-${type.value}`}
                    >
                      <Text
                        style={[
                          styles.typeLabel,
                          selected ? { color: "#6D4AFF" } : null,
                        ]}
                      >
                        {type.label}
                      </Text>
                      <Text style={styles.typeDescription}>
                        {type.description}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.requiredRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabelNoMargin}>
                    Required response
                  </Text>
                  <Text style={styles.sectionHint}>
                    Leaders must answer before publishing.
                  </Text>
                </View>
                <Switch
                  value={question?.required ?? false}
                  onValueChange={(required) => updateQuestion({ required })}
                  trackColor={{ false: "#CBD5E1", true: "#A5B4FC" }}
                  thumbColor={question?.required ? "#6D4AFF" : "#FFFFFF"}
                  accessibilityLabel="Required response"
                  testID="question-required-switch"
                />
              </View>
              <Text style={styles.fieldLabel}>Help text</Text>
              <TextInput
                value={question?.helpText ?? ""}
                onChangeText={(helpText) => updateQuestion({ helpText })}
                placeholder="Optional context for the leader"
                placeholderTextColor="#A0A8B5"
                maxLength={500}
                style={styles.input}
                accessibilityLabel="Question help text"
                testID="question-help-input"
              />
              {question?.type === "rating" ? (
                <>
                  <Text style={styles.fieldLabel}>Rating maximum</Text>
                  <View style={styles.ratingOptions}>
                    {[3, 4, 5, 7, 10].map((ratingMax) => (
                      <Pressable
                        key={ratingMax}
                        onPress={() => updateQuestion({ ratingMax })}
                        style={[
                          styles.ratingOption,
                          question.ratingMax === ratingMax
                            ? styles.ratingOptionSelected
                            : null,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: question.ratingMax === ratingMax,
                        }}
                        testID={`question-rating-max-${ratingMax}`}
                      >
                        <Text
                          style={[
                            styles.ratingText,
                            question.ratingMax === ratingMax
                              ? { color: "#FFFFFF" }
                              : null,
                          ]}
                        >
                          {ratingMax}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
              <Pressable
                onPress={deleteSelectedQuestion}
                style={styles.deleteQuestionButton}
                accessibilityRole="button"
                accessibilityLabel="Delete question"
                testID="delete-question"
              >
                <Trash2 size={15} color="#DC2626" strokeWidth={2.2} />
                <Text style={styles.deleteQuestionText}>Delete question</Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedQuestion(null)}
                style={styles.doneButton}
                accessibilityRole="button"
                testID="done-editing-question"
              >
                <Text style={styles.saveButtonText}>Done</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(confirmMode)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setConfirmMode(null);
          setDeleteBlock(null);
        }}
      >
        <Pressable
          style={styles.confirmOverlay}
          onPress={() => {
            setConfirmMode(null);
            setDeleteBlock(null);
          }}
        >
          <Pressable
            style={styles.confirmCard}
            onPress={(event) => event.stopPropagation()}
          >
            <View
              style={
                confirmMode === "delete"
                  ? deleteBlock
                    ? styles.protectedIcon
                    : styles.dangerIcon
                  : styles.leaveIcon
              }
            >
              {confirmMode === "delete" && deleteBlock ? (
                <LockKeyhole size={19} color="#5545D9" strokeWidth={2.2} />
              ) : confirmMode === "delete" ? (
                <Trash2 size={20} color="#EF4444" />
              ) : (
                <ArrowLeft size={20} color={"#6D4AFF"} />
              )}
            </View>
            <Text style={styles.confirmTitle}>
              {confirmMode === "delete"
                ? deleteBlock
                  ? "Template protected"
                  : "Delete this template?"
                : "Discard your changes?"}
            </Text>
            <Text style={styles.confirmBody}>
              {confirmMode === "delete"
                ? deleteBlock
                  ? "Alenio kept this template in place because it’s connected to your workspace process."
                  : "It will no longer be available for new check-ins. Existing check-in history stays intact."
                : "Your unsaved edits will be lost."}
            </Text>
            {confirmMode === "delete" && deleteBlock ? (
              <View style={styles.deleteReason}>
                <View style={styles.deleteReasonIcon}>
                  <CircleAlert size={14} color="#5545D9" strokeWidth={2.2} />
                </View>
                <Text style={styles.deleteReasonText}>{deleteBlock}</Text>
              </View>
            ) : null}
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => {
                  setConfirmMode(null);
                  setDeleteBlock(null);
                }}
                style={[
                  styles.cancelConfirm,
                  confirmMode === "delete" && deleteBlock
                    ? styles.protectedCloseButton
                    : null,
                ]}
                testID="cancel-template-confirmation"
              >
                <Text
                  style={[
                    styles.cancelConfirmText,
                    confirmMode === "delete" && deleteBlock
                      ? styles.protectedCloseButtonText
                      : null,
                  ]}
                >
                  {confirmMode === "delete"
                    ? deleteBlock
                      ? "Got it"
                      : "Keep it"
                    : "Keep editing"}
                </Text>
              </Pressable>
              {!(confirmMode === "delete" && deleteBlock) ? (
                <Pressable
                  onPress={() => {
                    if (confirmMode === "delete") {
                      deleteMutation.mutate();
                      return;
                    }
                    const navigate = pendingNavigation ?? (() => router.back());
                    setConfirmMode(null);
                    setAllowNavigation(true);
                    setTimeout(navigate, 0);
                  }}
                  disabled={deleteMutation.isPending}
                  style={
                    confirmMode === "delete"
                      ? styles.deleteConfirm
                      : styles.discardConfirm
                  }
                  testID={
                    confirmMode === "delete"
                      ? "confirm-delete-template-editor"
                      : "confirm-discard-template"
                  }
                >
                  {deleteMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {confirmMode === "delete" ? "Delete" : "Discard"}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={sectionMenuIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSectionMenuIndex(null)}
      >
        <Pressable
          style={[
            styles.sectionMenuOverlay,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
          onPress={() => setSectionMenuIndex(null)}
        >
          <Pressable
            style={styles.sectionMenuCard}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.sectionMenuTitle}>
              Section {(sectionMenuIndex ?? 0) + 1}
            </Text>
            {(
              [
                {
                  key: "up" as const,
                  label: "Move up",
                  icon: ArrowUp,
                  disabled: sectionMenuIndex === 0,
                  testID: `move-section-up-${sectionMenuIndex ?? 0}`,
                },
                {
                  key: "down" as const,
                  label: "Move down",
                  icon: ArrowDown,
                  disabled:
                    sectionMenuIndex === null ||
                    sectionMenuIndex >= draft.sections.length - 1,
                  testID: `move-section-down-${sectionMenuIndex ?? 0}`,
                },
                {
                  key: "duplicate" as const,
                  label: "Duplicate section",
                  icon: Copy,
                  disabled: false,
                  testID: `duplicate-section-${sectionMenuIndex ?? 0}`,
                },
              ] as const
            ).map((action) => (
              <Pressable
                key={action.key}
                disabled={action.disabled}
                onPress={() => {
                  if (sectionMenuIndex === null || action.disabled) return;
                  const index = sectionMenuIndex;
                  setSectionMenuIndex(null);
                  mutateSection(index, action.key);
                }}
                style={[
                  styles.sectionMenuRow,
                  action.disabled ? styles.disabled : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: action.disabled }}
                testID={action.testID}
              >
                <action.icon size={16} color="#3F4658" strokeWidth={2.2} />
                <Text style={styles.sectionMenuLabel}>{action.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                if (sectionMenuIndex === null) return;
                requestDeleteSection(sectionMenuIndex);
              }}
              style={[styles.sectionMenuRow, styles.sectionMenuDeleteRow]}
              accessibilityRole="button"
              accessibilityLabel="Delete section"
              testID={`delete-section-${sectionMenuIndex ?? 0}`}
            >
              <Trash2 size={16} color="#DC2626" strokeWidth={2.2} />
              <Text style={styles.sectionMenuDelete}>Delete section</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.page },
  headerWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  topBar: {
    zIndex: 2,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "transparent",
  },
  topAction: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  topActionActive: { backgroundColor: "rgba(255,255,255,0.28)" },
  topTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  topSubtitle: {
    marginTop: 1,
    maxWidth: 260,
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
  },
  pageSheet: {
    flex: 1,
    marginTop: -8,
    borderTopLeftRadius: BAND_SHEET_RADIUS,
    borderTopRightRadius: BAND_SHEET_RADIUS,
    backgroundColor: palette.page,
    overflow: "hidden",
  },
  stepper: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepperItem: { flex: 1, alignItems: "center" },
  stepperTrack: {
    height: 28,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDE7FF",
    zIndex: 1,
  },
  stepperDotOn: { backgroundColor: palette.violet },
  stepperDotDone: { backgroundColor: "#0F9D6E" },
  stepperNumber: { fontSize: 13, fontWeight: "800", color: "#8B7CC8" },
  stepperNumberOn: { color: "#FFFFFF" },
  stepperLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    color: "#8B95A8",
    textAlign: "center",
  },
  stepperLabelOn: { color: palette.violet },
  stepperLine: {
    position: "absolute",
    top: 13,
    height: 2,
    backgroundColor: "#E4DFF4",
  },
  stepperLineLeft: { left: 0, right: "50%", marginRight: 18 },
  stepperLineRight: { left: "50%", right: 0, marginLeft: 18 },
  stepperLineOn: { backgroundColor: palette.violet },
  content: { padding: 16, gap: 14 },
  stepCount: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.violet,
  },
  stepTitle: {
    marginTop: 2,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#17142B",
  },
  stepTrack: { marginTop: 12, flexDirection: "row", gap: 6 },
  stepSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E4DFF4",
  },
  stepSegmentActive: { backgroundColor: palette.violet },
  formCard: {
    padding: 14,
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEEAF6",
    backgroundColor: "#FFFFFF",
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B728C",
  },
  sectionTitle: {
    marginTop: 2,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#17142B",
  },
  sectionHint: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: "#8A96A8",
  },
  stepIntro: { marginTop: 6, fontSize: 14, lineHeight: 20, color: "#667085" },
  charCount: {
    alignSelf: "flex-end",
    marginTop: -2,
    fontSize: 11,
    fontWeight: "600",
    color: "#A0A8B8",
  },
  detailsArt: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsArtBlob: {
    position: "absolute",
    width: 150,
    height: 78,
    borderRadius: 40,
    backgroundColor: "#E7DEFF",
  },
  detailsArtCard: {
    width: 108,
    height: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "space-between",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: "#6D4AFF",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  detailsArtRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailsArtBox: {
    width: 12,
    height: 12,
    borderRadius: 4,
    backgroundColor: "#EDE9FE",
  },
  detailsArtBoxOn: { backgroundColor: "#C4B5FD" },
  detailsArtLine: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EDE9FE",
  },
  sectionQuestionCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B95A8",
  },
  backButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6E2F2",
    backgroundColor: "#FFFFFF",
  },
  backButtonText: { fontSize: 15, fontWeight: "700", color: "#3F4658" },
  fieldLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#3F4658",
  },
  fieldLabelNoMargin: { fontSize: 11.5, fontWeight: "700", color: "#334155" },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E2F2",
    backgroundColor: "#FBFBFE",
    fontSize: 15,
    color: "#17142B",
  },
  textarea: { minHeight: 78, textAlignVertical: "top" },
  inputInvalid: { borderColor: "#EF4444" },
  inlineInvalid: {
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 8,
    paddingHorizontal: 6,
    marginLeft: -6,
  },
  questionRowInvalid: {
    borderWidth: 1,
    borderColor: "#EF4444",
    borderTopColor: "#EF4444",
    borderRadius: 12,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  readOnlyBanner: {
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
  },
  readOnlyTitle: { fontSize: 12.5, fontWeight: "700", color: "#92400E" },
  readOnlyBody: { marginTop: 2, fontSize: 10.5, color: "#B45309" },
  validationCard: {
    padding: 13,
    gap: 4,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  validationTitle: { fontSize: 12.5, fontWeight: "800", color: "#991B1B" },
  validationText: { fontSize: 10.5, lineHeight: 15, color: "#B91C1C" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "hidden",
    borderRadius: 999,
    fontSize: 9.5,
    fontWeight: "700",
    color: "#6D4AFF",
    backgroundColor: "#F3EEFF",
  },
  prepRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  prepNumber: {
    width: 17,
    fontSize: 10.5,
    fontWeight: "800",
    color: "#6D4AFF",
    textAlign: "center",
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#F5F7FA",
  },
  addOutlineButton: {
    minHeight: 39,
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderStyle: "dashed",
    backgroundColor: "#FBFBFE",
  },
  addOutlineText: { fontSize: 14, fontWeight: "700", color: "#3F4658" },
  sectionsHeading: {
    marginTop: 4,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E4DFF4",
    backgroundColor: "#FFFFFF",
    shadowColor: "#2A2158",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionCardHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3EEFF",
    flexShrink: 0,
  },
  sectionIdentity: { flex: 1, minWidth: 0, gap: 2 },
  sectionIndexLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: "#8B95A8",
  },
  sectionTitleRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionDisplayTitle: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    color: "#17142B",
  },
  sectionTitleEditor: {
    minHeight: 28,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    color: "#17142B",
  },
  sectionCountBadge: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F4F0FF",
  },
  sectionCountText: { fontSize: 11, fontWeight: "700", color: "#6D4AFF" },
  sectionMenuButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sectionMenuOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: "rgba(15, 23, 42, 0.46)",
  },
  sectionMenuCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  sectionMenuTitle: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: "#8B95A8",
  },
  sectionMenuRow: {
    minHeight: 48,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
  },
  sectionMenuLabel: { fontSize: 15, fontWeight: "600", color: "#17142B" },
  sectionMenuDelete: { fontSize: 15, fontWeight: "600", color: "#DC2626" },
  sectionMenuDeleteRow: {
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEEAF6",
    borderRadius: 0,
  },
  sectionDragHandle: {
    width: 28,
    height: 39,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF1F6",
  },
  questionDragHandle: {
    width: 22,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionFieldLabel: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#3F4658",
  },
  sectionTitleField: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E2F2",
    backgroundColor: "#FBFBFE",
    fontSize: 15,
    color: "#17142B",
  },
  sectionTitleInput: {
    flex: 1,
    height: 39,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: "#F5F7FA",
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0F172A",
  },
  sectionActions: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
  },
  smallAction: {
    width: 30,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#F5F7FA",
  },
  disabled: { opacity: 0.4 },
  questionRow: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEEAF6",
  },
  questionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3EEFF",
  },
  questionNumberText: { fontSize: 12, fontWeight: "700", color: "#6D4AFF" },
  quietIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  questionLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
    color: "#17142B",
  },
  questionType: { marginTop: 2, fontSize: 12, color: "#8B95A8" },
  questionHelp: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    color: "#8A96A8",
  },
  addQuestionButton: {
    minHeight: 42,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 13,
    backgroundColor: "#F4F0FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addQuestionText: { fontSize: 14, fontWeight: "700", color: "#6D4AFF" },
  addSectionButton: {
    minHeight: 48,
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D4CCF5",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addSectionText: { fontSize: 15, fontWeight: "700", color: "#6D4AFF" },
  deleteTemplateButton: {
    minHeight: 45,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFFFFF",
  },
  deleteTemplateText: { fontSize: 12.5, fontWeight: "700", color: "#EF4444" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    flexDirection: "row",
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEEAF6",
    backgroundColor: "#F7F5FC",
  },
  previewButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  previewButtonText: { fontSize: 12.5, fontWeight: "700", color: "#475569" },
  saveButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 14,
    backgroundColor: palette.violet,
  },
  saveButtonText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  previewHero: { paddingHorizontal: 2, paddingTop: 4 },
  previewTitle: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#17142B",
  },
  previewDescription: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: "#667085",
  },
  prepPreview: {
    padding: 15,
    gap: 7,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
  },
  prepPreviewItem: { fontSize: 11.5, lineHeight: 17, color: "#475569" },
  previewSection: {
    padding: 15,
    gap: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#EEEAF6",
    backgroundColor: "#FFFFFF",
  },
  previewQuestion: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  previewInput: {
    minHeight: 40,
    marginTop: 8,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F6F5FA",
  },
  previewInputText: { fontSize: 13, color: "#A0A8B8" },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#FFFFFF",
  },
  sheetHandle: {
    width: 38,
    height: 4,
    marginTop: 9,
    alignSelf: "center",
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
  },
  sheetHeader: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  sheetContent: { paddingHorizontal: 18, paddingBottom: 16, gap: 8 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeOption: {
    width: "48%",
    minHeight: 62,
    padding: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  typeOptionSelected: { borderColor: "#6D4AFF", backgroundColor: "#F3EEFF" },
  typeLabel: { fontSize: 11.5, fontWeight: "700", color: "#334155" },
  typeDescription: {
    marginTop: 3,
    fontSize: 9.5,
    lineHeight: 13,
    color: "#8A96A8",
  },
  requiredRow: {
    marginTop: 4,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
  },
  ratingOptions: { flexDirection: "row", gap: 8 },
  ratingOption: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
  },
  ratingOptionSelected: { backgroundColor: "#6D4AFF" },
  ratingText: { fontSize: 12, fontWeight: "800", color: "#475569" },
  deleteQuestionButton: {
    minHeight: 42,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF7F7",
  },
  deleteQuestionText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#DC2626",
  },
  doneButton: {
    minHeight: 44,
    marginTop: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#6D4AFF",
  },
  confirmOverlay: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.46)",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    padding: 20,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  dangerIcon: {
    width: 42,
    height: 42,
    marginBottom: 12,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
  },
  protectedIcon: {
    width: 42,
    height: 42,
    marginBottom: 12,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFEDFF",
  },
  leaveIcon: {
    width: 42,
    height: 42,
    marginBottom: 12,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  confirmTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  confirmBody: { marginTop: 8, fontSize: 13, lineHeight: 19, color: "#64748B" },
  deleteReason: {
    marginTop: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCD8FF",
    backgroundColor: "#F8F7FF",
  },
  deleteReasonIcon: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECE9FF",
  },
  deleteReasonText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
    color: "#69617F",
  },
  confirmActions: { marginTop: 20, flexDirection: "row", gap: 9 },
  cancelConfirm: {
    flex: 1,
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  cancelConfirmText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  protectedCloseButton: { backgroundColor: "#5545D9" },
  protectedCloseButtonText: { color: "#FFFFFF" },
  deleteConfirm: {
    flex: 1,
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EF4444",
  },
  discardConfirm: {
    flex: 1,
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#6D4AFF",
  },
});
