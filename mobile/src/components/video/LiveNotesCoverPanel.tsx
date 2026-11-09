import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react-native";
import type { LiveNotesSession } from "@/lib/meeting-check-in-tool";

type Status = "starting" | "active" | "error";

type Props = {
  session: LiveNotesSession;
  status: Status;
  error?: string | null;
  bottomOffset: number;
  onStop: () => void;
};

/**
 * Compact in-call list of the chosen form's questions, so the leader can
 * follow the same prompts as an in-person recorded check-in without covering
 * the other person.
 */
export function LiveNotesCoverPanel({
  session,
  status,
  error,
  bottomOffset,
  onStop,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const memberName =
    session.pair.member.name?.trim() ||
    session.pair.member.email.split("@")[0] ||
    "them";
  const statusLabel =
    status === "starting"
      ? "Starting live notes…"
      : status === "error"
        ? error || "Live notes could not start"
        : `Listening · ${session.templateTitle}`;

  return (
    <View
      style={[styles.wrap, { bottom: bottomOffset }]}
      testID="live-notes-cover-panel"
    >
      <Pressable
        onPress={() => setExpanded((open) => !open)}
        style={[styles.header, status === "error" ? styles.headerError : null]}
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? "Hide check-in questions" : "Show check-in questions"
        }
      >
        <View style={styles.headerIcon}>
          <Sparkles size={13} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {statusLabel}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {`Check-in for ${memberName}`}
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={16} color="rgba(255,255,255,0.85)" />
        ) : (
          <ChevronDown size={16} color="rgba(255,255,255,0.85)" />
        )}
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {session.questions.length > 0 ? (
            <>
              <Text style={styles.questionsTitle}>What to cover</Text>
              <ScrollView
                style={styles.questionsScroll}
                contentContainerStyle={styles.questionsList}
                showsVerticalScrollIndicator={false}
              >
                {session.questions.map((question, index) => (
                  <View key={`${index}-${question}`} style={styles.questionRow}>
                    <Text style={styles.questionNumber}>{index + 1}</Text>
                    <Text style={styles.questionText}>{question}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : (
            <View style={styles.openHint}>
              <Text style={styles.questionsTitle}>No set questions</Text>
              <Text style={styles.openHintText}>
                Talk through whatever matters. Seneca works out the questions
                you covered once you finish.
              </Text>
            </View>
          )}
          <Pressable
            onPress={onStop}
            style={styles.stopButton}
            accessibilityRole="button"
            accessibilityLabel="Stop live notes"
            testID="live-notes-cover-stop"
          >
            <Text style={styles.stopLabel}>Stop live notes</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 43,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(10,15,30,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  header: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(67,97,238,0.92)",
  },
  headerError: {
    backgroundColor: "rgba(190,18,60,0.94)",
  },
  headerIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 1 },
  headerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "rgba(255,255,255,0.78)",
  },
  body: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  questionsTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: "rgba(255,255,255,0.72)",
  },
  questionsScroll: {
    maxHeight: 148,
  },
  questionsList: { gap: 8, paddingBottom: 2 },
  questionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  questionNumber: {
    minWidth: 14,
    fontSize: 11,
    fontWeight: "800",
    color: "#A5B4FC",
    lineHeight: 16,
  },
  questionText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    color: "#F8FAFC",
  },
  openHint: { gap: 4 },
  openHintText: {
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(255,255,255,0.72)",
  },
  stopButton: {
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  stopLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
