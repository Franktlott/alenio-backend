import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  submitOneOnOneAssociateFeedback,
  type OneOnOneAssociateFeedbackContext,
} from "@/lib/one-on-one-feedback-api";
import {
  ASSOCIATE_FEEDBACK_COMPLETE_DELAY_MS,
  ASSOCIATE_FEEDBACK_COMPLETE_MESSAGE,
  ASSOCIATE_FEEDBACK_INTRO,
  ASSOCIATE_FEEDBACK_MODE_LABEL,
  ASSOCIATE_FEEDBACK_NONE_LABEL,
  ASSOCIATE_FEEDBACK_PLACEHOLDER,
  ASSOCIATE_FEEDBACK_SUBMIT_LABEL,
  LEADER_COMMENTS_PREVIEW_TITLE,
  formatLeaderCommentsFrom,
  NO_FEEDBACK_VALUE,
} from "@/lib/one-on-one-feedback";

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

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.45)",
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
            maxWidth: 320,
            borderWidth: 1,
            borderColor: "#BBF7D0",
            borderRadius: 16,
            padding: 24,
            backgroundColor: "#F0FDF4",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: "#22C55E",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "800", marginTop: -1 }}>✓</Text>
          </View>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: "#15803D",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            {ASSOCIATE_FEEDBACK_COMPLETE_MESSAGE}
          </Text>
          <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20, textAlign: "center" }}>
            {submittedMode === "none" ? "Recorded as nothing to add." : "Your takeaways are saved to the check-in."}
          </Text>
        </View>
      </View>
    </Modal>
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

  useEffect(() => {
    if (!completedInSession) return;
    const timer = setTimeout(() => onSubmittedRef.current?.(), ASSOCIATE_FEEDBACK_COMPLETE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [completedInSession]);

  const onSubmit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const response = mode === "none" ? NO_FEEDBACK_VALUE : feedback.trim();
      if (mode === "feedback" && !response) {
        setErr("Add your notes or choose nothing to add.");
        return;
      }
      onCompletionStarted?.();
      await submitOneOnOneAssociateFeedback(teamId, memberUserId, meetingId, {
        fieldId: context.fieldId,
        response,
      });
      setSubmittedMode(mode);
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
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 12,
        padding: 14,
        backgroundColor: "#FFFFFF",
        marginBottom: 16,
      }}
    >
      <Text style={{ fontSize: 13, color: "#475569", lineHeight: 18, marginBottom: 10 }}>
        {ASSOCIATE_FEEDBACK_INTRO}
      </Text>
      {context.helpText ? (
        <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10, lineHeight: 17 }}>{context.helpText}</Text>
      ) : null}

      {context.leaderComments ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: 10,
            backgroundColor: "#F8FAFC",
            padding: 12,
            marginBottom: 12,
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

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
        <Pressable
          onPress={() => setMode("feedback")}
          style={{
            flex: 1,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: mode === "feedback" ? "#6366F1" : "#E2E8F0",
            backgroundColor: mode === "feedback" ? "#EEF2FF" : "#FFFFFF",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#334155", textAlign: "center" }}>
            {ASSOCIATE_FEEDBACK_MODE_LABEL}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("none")}
          style={{
            flex: 1,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: mode === "none" ? "#6366F1" : "#E2E8F0",
            backgroundColor: mode === "none" ? "#EEF2FF" : "#FFFFFF",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#334155", textAlign: "center" }}>
            {ASSOCIATE_FEEDBACK_NONE_LABEL}
          </Text>
        </Pressable>
      </View>

      {mode === "feedback" ? (
        <TextInput
          value={feedback}
          onChangeText={setFeedback}
          multiline
          placeholder={ASSOCIATE_FEEDBACK_PLACEHOLDER}
          placeholderTextColor="#94A3B8"
          style={{
            minHeight: 110,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: 10,
            padding: 10,
            fontSize: 14,
            color: "#0F172A",
            textAlignVertical: "top",
            marginBottom: 10,
          }}
        />
      ) : (
        <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10, lineHeight: 17 }}>
          We&apos;ll record that you have nothing to add right now.
        </Text>
      )}

      {err ? <Text style={{ fontSize: 12, color: "#DC2626", marginBottom: 8 }}>{err}</Text> : null}

      <Pressable
        onPress={() => void onSubmit()}
        disabled={saving}
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#0F172A",
          borderRadius: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>{ASSOCIATE_FEEDBACK_SUBMIT_LABEL}</Text>
        )}
      </Pressable>
    </View>
  );
}
