import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { WalkRunCorrectiveAction } from "../../lib/types";
import { colors } from "../../lib/theme";

type Props = {
  title: string;
  actions: WalkRunCorrectiveAction[];
  unlocked: boolean;
  lockedHint?: string;
  busy?: boolean;
  onComplete: (actionId: string) => void;
};

export function FailureProcedurePanel({
  title,
  actions,
  unlocked,
  lockedHint,
  busy,
  onComplete,
}: Props) {
  const visible = actions.filter((a) => a.status !== "SKIPPED" && a.status !== "LOCKED");
  const completedCount = visible.filter((a) => a.status === "COMPLETED").length;
  const current = visible.find((a) => a.status === "PENDING") ?? null;
  const currentIndex = current ? visible.findIndex((a) => a.id === current.id) : -1;
  const total = visible.length;

  if (total === 0) return null;

  return (
    <View style={[styles.card, !unlocked && styles.cardLocked]}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {!unlocked
            ? "Locked"
            : completedCount >= total
              ? "All done"
              : `Step ${Math.max(currentIndex + 1, 1)} of ${total}`}
        </Text>
      </View>
      {!unlocked && lockedHint ? <Text style={styles.hint}>{lockedHint}</Text> : null}

      {unlocked && completedCount > 0 ? (
        <Text style={styles.progressNote}>
          {completedCount} of {total} completed — finish the next step to continue.
        </Text>
      ) : null}

      {unlocked && current ? (
        <View style={styles.step}>
          <Text style={styles.stepKicker}>
            STEP {currentIndex + 1} OF {total}
          </Text>
          <Text style={styles.stepTitle}>{current.title}</Text>
          {current.instructions && current.instructions !== current.title ? (
            <Text style={styles.stepBody}>{current.instructions}</Text>
          ) : null}
          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => onComplete(current.id)}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Mark complete</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {unlocked && !current && completedCount >= total ? (
        <Text style={styles.done}>All steps in this phase are complete.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 14,
    marginBottom: 14,
  },
  cardLocked: {
    opacity: 0.78,
    backgroundColor: "#F8FAFC",
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: colors.fail,
  },
  meta: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
    lineHeight: 18,
  },
  progressNote: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  step: {
    paddingTop: 4,
  },
  stepKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.brand,
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
  },
  stepBody: {
    marginTop: 6,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  done: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: colors.pass,
  },
  btn: {
    marginTop: 14,
    alignSelf: "stretch",
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
});
