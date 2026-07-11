import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Check,
  ClipboardPen,
  EyeOff,
  MessageSquare,
  Pencil,
  Save,
  Sparkles,
  Footprints,
  Target,
  Users,
} from "lucide-react-native";
import {
  submitOneOnOneAssociateFeedback,
  type OneOnOneAssociateFeedbackContext,
} from "@/lib/one-on-one-feedback-api";
import { invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import {
  ASSOCIATE_FEEDBACK_COMPLETE_DELAY_MS,
  ASSOCIATE_FEEDBACK_COMPLETE_MESSAGE,
  ASSOCIATE_FEEDBACK_MODE_LABEL,
  ASSOCIATE_FEEDBACK_NONE_LABEL,
  ASSOCIATE_FEEDBACK_PLACEHOLDER,
  ASSOCIATE_FEEDBACK_SUBMIT_LABEL,
  LEADER_COMMENTS_PREVIEW_TITLE,
  formatLeaderCommentsFrom,
  NO_FEEDBACK_VALUE,
} from "@/lib/one-on-one-feedback";
import { useQueryClient } from "@tanstack/react-query";

const MAX_CHARS = 500;
const ACCENT = "#7C3AED";
const ACCENT_SOFT = "#F5F3FF";
const QUICK_CHIPS = [
  { id: "takeaways", label: "Key takeaways", prefix: "Key takeaways: ", Icon: Check },
  { id: "commitments", label: "Commitments", prefix: "Commitments: ", Icon: Target },
  { id: "next", label: "Next steps", prefix: "Next steps: ", Icon: Footprints },
] as const;

type Props = {
  teamId: string;
  memberUserId: string;
  meetingId: string;
  context: OneOnOneAssociateFeedbackContext;
  onCompletionStarted?: () => void;
  onCompletionFailed?: () => void;
  onSubmitted?: () => void;
};

function FeedbackCompleteModal({ submittedMode }: { submittedMode: "feedback" | "none" }) {
  const insets = useSafeAreaInsets();
  const subtitle =
    submittedMode === "none"
      ? "We recorded that you had nothing to add this time."
      : "Your takeaways are saved with this conversation.";

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.55)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 340,
            borderRadius: 24,
            overflow: "hidden",
            backgroundColor: "#FFFFFF",
            shadowColor: "#4C1D95",
            shadowOpacity: 0.2,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 12 },
            elevation: 10,
          }}
        >
          <LinearGradient
            colors={["#4361EE", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingTop: 28, paddingBottom: 36, paddingHorizontal: 24, alignItems: "center" }}
          >
            <View style={{ position: "absolute", top: 18, left: 22, opacity: 0.35 }}>
              <Sparkles size={16} color="#FFFFFF" />
            </View>
            <View style={{ position: "absolute", top: 28, right: 28, opacity: 0.3 }}>
              <Sparkles size={14} color="#FFFFFF" />
            </View>
            <View style={{ position: "absolute", bottom: 18, left: 40, opacity: 0.25 }}>
              <Sparkles size={12} color="#FFFFFF" />
            </View>

            <Image
              source={require("@/assets/alenio-icon.png")}
              style={{ width: 36, height: 36, borderRadius: 9, marginBottom: 16 }}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: "rgba(255,255,255,0.7)",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Check-in complete
            </Text>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: "rgba(255,255,255,0.2)",
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.45)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={28} color="#7C3AED" strokeWidth={3} />
              </View>
            </View>
          </LinearGradient>

          <View style={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 26, alignItems: "center" }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: "#0F172A",
                textAlign: "center",
                marginBottom: 10,
                letterSpacing: -0.3,
                lineHeight: 26,
              }}
            >
              {ASSOCIATE_FEEDBACK_COMPLETE_MESSAGE}
            </Text>
            <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 21, textAlign: "center", marginBottom: 18 }}>
              {subtitle}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: ACCENT_SOFT,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: "#EDE9FE",
              }}
            >
              <MessageSquare size={14} color={ACCENT} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#5B21B6", flexShrink: 1 }}>
                {submittedMode === "none"
                  ? "Nothing to add was noted on this check-in."
                  : "Notes are now part of your check-in record."}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function HeroIllustration() {
  return (
    <View style={{ alignItems: "center", marginBottom: 18, marginTop: 4 }}>
      <View style={{ width: 88, height: 88, alignItems: "center", justifyContent: "center" }}>
        <Sparkles
          size={14}
          color="#A5B4FC"
          style={{ position: "absolute", top: 4, left: 10 }}
          fill="#C7D2FE"
        />
        <Sparkles
          size={12}
          color="#A5B4FC"
          style={{ position: "absolute", top: 10, right: 8 }}
          fill="#C7D2FE"
        />
        <Sparkles
          size={11}
          color="#A5B4FC"
          style={{ position: "absolute", bottom: 12, left: 6 }}
          fill="#C7D2FE"
        />
        <Sparkles
          size={13}
          color="#A5B4FC"
          style={{ position: "absolute", bottom: 8, right: 12 }}
          fill="#C7D2FE"
        />
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: ACCENT_SOFT,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#EDE9FE",
          }}
        >
          <ClipboardPen size={28} color={ACCENT} strokeWidth={1.8} />
        </View>
      </View>
    </View>
  );
}

export function OneOnOneAssociateFeedbackForm({
  teamId,
  memberUserId,
  meetingId,
  context,
  onCompletionStarted,
  onCompletionFailed,
  onSubmitted,
}: Props) {
  const [mode, setMode] = useState<"feedback" | "none">(
    context.currentResponse === NO_FEEDBACK_VALUE ? "none" : "feedback",
  );
  const [feedback, setFeedback] = useState(
    context.currentResponse === NO_FEEDBACK_VALUE ? "" : context.currentResponse,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(context.submitted);
  const [completedInSession, setCompletedInSession] = useState(false);
  const [submittedMode, setSubmittedMode] = useState<"feedback" | "none">(
    context.currentResponse === NO_FEEDBACK_VALUE ? "none" : "feedback",
  );
  const onSubmittedRef = useRef(onSubmitted);
  onSubmittedRef.current = onSubmitted;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!completedInSession) return;
    const timer = setTimeout(() => onSubmittedRef.current?.(), ASSOCIATE_FEEDBACK_COMPLETE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [completedInSession]);

  const insertChip = (prefix: string) => {
    setMode("feedback");
    setFeedback((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return prefix;
      if (trimmed.includes(prefix.trim())) return prev;
      const next = `${trimmed}\n\n${prefix}`;
      return next.slice(0, MAX_CHARS);
    });
  };

  const onSubmit = async (submitMode: "feedback" | "none" = mode) => {
    setSaving(true);
    setErr(null);
    try {
      const response = submitMode === "none" ? NO_FEEDBACK_VALUE : feedback.trim();
      if (submitMode === "feedback" && !response) {
        setErr("Add your notes or choose nothing to add.");
        return;
      }
      onCompletionStarted?.();
      await submitOneOnOneAssociateFeedback(teamId, memberUserId, meetingId, {
        fieldId: context.fieldId,
        response,
      });
      // Refresh task lists/badges immediately — don't wait for the celebration screen to finish.
      invalidateTaskCaches(queryClient, teamId);
      setSubmittedMode(submitMode);
      setDone(true);
      setCompletedInSession(true);
    } catch (e) {
      onCompletionFailed?.();
      setErr(e instanceof Error ? e.message : "Could not save your notes.");
    } finally {
      setSaving(false);
    }
  };

  if (done && completedInSession) {
    return <FeedbackCompleteModal submittedMode={submittedMode} />;
  }

  if (done) {
    return null;
  }

  return (
    <View
      style={{
        borderRadius: 20,
        backgroundColor: "#FFFFFF",
        marginBottom: 24,
        marginTop: 8,
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 20,
        borderWidth: 1,
        borderColor: "#EEF2FF",
        shadowColor: "#4C1D95",
        shadowOpacity: 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }}
    >
      <HeroIllustration />

      <Text
        style={{
          fontSize: 22,
          fontWeight: "800",
          color: "#0F172A",
          textAlign: "center",
          marginBottom: 8,
          letterSpacing: -0.3,
        }}
      >
        Capture key takeaways
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: "#64748B",
          textAlign: "center",
          lineHeight: 20,
          marginBottom: 18,
          paddingHorizontal: 4,
        }}
      >
        Jot down important takeaways, commitments, and next steps from your conversation.
      </Text>

      {context.leaderComments ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: 14,
            backgroundColor: "#F8FAFC",
            padding: 12,
            marginBottom: 14,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748B", letterSpacing: 0.6, marginBottom: 4 }}>
            {(context.leaderCommentsLabel ?? LEADER_COMMENTS_PREVIEW_TITLE).toUpperCase()}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#4361EE", marginBottom: 8 }}>
            {formatLeaderCommentsFrom(context.leaderCommentsFrom)}
          </Text>
          <Text style={{ fontSize: 14, color: "#0F172A", lineHeight: 20 }}>{context.leaderComments}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
        <Pressable
          onPress={() => setMode("feedback")}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 12,
            paddingHorizontal: 10,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: mode === "feedback" ? ACCENT : "#E2E8F0",
            backgroundColor: mode === "feedback" ? ACCENT_SOFT : "#FFFFFF",
          }}
        >
          <Users size={16} color={mode === "feedback" ? ACCENT : "#94A3B8"} />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: mode === "feedback" ? ACCENT : "#64748B",
            }}
          >
            {ASSOCIATE_FEEDBACK_MODE_LABEL}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("none")}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 12,
            paddingHorizontal: 10,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: mode === "none" ? ACCENT : "#E2E8F0",
            backgroundColor: mode === "none" ? ACCENT_SOFT : "#FFFFFF",
          }}
        >
          <EyeOff size={16} color={mode === "none" ? ACCENT : "#94A3B8"} />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: mode === "none" ? ACCENT : "#64748B",
            }}
          >
            {ASSOCIATE_FEEDBACK_NONE_LABEL}
          </Text>
        </Pressable>
      </View>

      {mode === "feedback" ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Pencil size={15} color={ACCENT} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>What would you like to add?</Text>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 14,
              backgroundColor: "#FFFFFF",
              marginBottom: 12,
              overflow: "hidden",
            }}
          >
            <TextInput
              value={feedback}
              onChangeText={(text) => setFeedback(text.slice(0, MAX_CHARS))}
              multiline
              maxLength={MAX_CHARS}
              placeholder={ASSOCIATE_FEEDBACK_PLACEHOLDER}
              placeholderTextColor="#94A3B8"
              style={{
                minHeight: 130,
                paddingHorizontal: 14,
                paddingTop: 14,
                paddingBottom: 28,
                fontSize: 15,
                color: "#0F172A",
                textAlignVertical: "top",
                lineHeight: 22,
              }}
            />
            <Text
              style={{
                position: "absolute",
                right: 12,
                bottom: 10,
                fontSize: 12,
                color: "#94A3B8",
                fontWeight: "500",
              }}
            >
              {feedback.length}/{MAX_CHARS}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {QUICK_CHIPS.map(({ id, label, prefix, Icon }) => (
              <Pressable
                key={id}
                onPress={() => insertChip(prefix)}
                style={{
                  flexGrow: 1,
                  flexBasis: "30%",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  paddingHorizontal: 8,
                  paddingVertical: 9,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Icon size={13} color="#64748B" />
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <Text style={{ fontSize: 13, color: "#94A3B8", marginBottom: 14, lineHeight: 19, textAlign: "center" }}>
          We&apos;ll record that you have nothing to add right now.
        </Text>
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          backgroundColor: ACCENT_SOFT,
          borderRadius: 14,
          padding: 14,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: "#EDE9FE",
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          <MessageSquare size={15} color={ACCENT} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: ACCENT, marginBottom: 2 }}>
            Added to your check-in
          </Text>
          <Text style={{ fontSize: 12, color: "#64748B", lineHeight: 17 }}>
            Your notes are saved with this conversation so you and your leader can refer back to them.
          </Text>
        </View>
      </View>

      {err ? <Text style={{ fontSize: 12, color: "#DC2626", marginBottom: 10 }}>{err}</Text> : null}

      <Pressable
        onPress={() => void onSubmit()}
        disabled={saving}
        style={{ opacity: saving ? 0.75 : 1 }}
      >
        <LinearGradient
          colors={["#7C3AED", "#4361EE"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            borderRadius: 14,
            paddingVertical: 15,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Save size={18} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>
                {ASSOCIATE_FEEDBACK_SUBMIT_LABEL}
              </Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  );
}
