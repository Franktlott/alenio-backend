import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import {
  submitOneOnOneAssociateFeedback,
  type OneOnOneAssociateFeedbackContext,
} from "@/lib/one-on-one-feedback-api";
import { NO_FEEDBACK_VALUE } from "@/lib/one-on-one-feedback";

type Props = {
  teamId: string;
  memberUserId: string;
  meetingId: string;
  context: OneOnOneAssociateFeedbackContext;
  onSubmitted?: () => void;
};

export function OneOnOneAssociateFeedbackForm({
  teamId,
  memberUserId,
  meetingId,
  context,
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

  const onSubmit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const response = mode === "none" ? NO_FEEDBACK_VALUE : feedback.trim();
      if (mode === "feedback" && !response) {
        setErr("Enter your feedback or choose no feedback entered.");
        return;
      }
      await submitOneOnOneAssociateFeedback(teamId, memberUserId, meetingId, {
        fieldId: context.fieldId,
        response,
      });
      setDone(true);
      onSubmitted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit feedback.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: "#E2E8F0",
          borderRadius: 12,
          padding: 14,
          backgroundColor: "#F8FAFC",
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", marginBottom: 4 }}>
          Thanks — your response was saved.
        </Text>
        <Text style={{ fontSize: 13, color: "#64748B", lineHeight: 18 }}>
          This task is now complete.
        </Text>
      </View>
    );
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
        Share your notes for <Text style={{ fontWeight: "700", color: "#0F172A" }}>{context.fieldLabel}</Text> from
        the {context.meetingTitle} check-in.
      </Text>
      {context.helpText ? (
        <Text style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10, lineHeight: 17 }}>{context.helpText}</Text>
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
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#334155", textAlign: "center" }}>Enter feedback</Text>
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
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#334155", textAlign: "center" }}>No feedback</Text>
        </Pressable>
      </View>

      {mode === "feedback" ? (
        <TextInput
          value={feedback}
          onChangeText={setFeedback}
          multiline
          placeholder={`Your thoughts on ${context.fieldLabel.toLowerCase()}…`}
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
          We&apos;ll record that you have no feedback for this question.
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
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Submit feedback & complete</Text>
        )}
      </Pressable>
    </View>
  );
}
