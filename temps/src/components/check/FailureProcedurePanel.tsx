import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { WalkRunCorrectiveAction } from "../../lib/types";
import { colors } from "../../lib/theme";

type Props = {
  title: string;
  actions: WalkRunCorrectiveAction[];
  unlocked: boolean;
  lockedHint?: string;
  busy?: boolean;
  /** Detail under FAIL, e.g. "61.47 °F is above the limit (≤ 41.0 °F)" */
  failSummary?: string | null;
  /** Called once every pending step is checked — parent completes them in order. */
  onCompleteAll: () => void;
};

function actionGlyph(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("probe") || t.includes("retemp") || t.includes("temp")) return "⌀";
  if (t.includes("discard") || t.includes("trash") || t.includes("waste")) return "⌫";
  if (t.includes("clean") || t.includes("wipe") || t.includes("sanitize")) return "✎";
  if (t.includes("brew") || t.includes("fresh") || t.includes("batch")) return "◉";
  if (t.includes("notify") || t.includes("mod") || t.includes("alert")) return "◎";
  if (t.includes("proceed") || t.includes("re-temp") || t.includes("re temp")) return "→";
  return "•";
}

export function FailureProcedurePanel({
  title: _title,
  actions,
  unlocked,
  lockedHint,
  busy,
  failSummary,
  onCompleteAll,
}: Props) {
  const visible = useMemo(
    () => actions.filter((a) => a.status !== "SKIPPED" && a.status !== "LOCKED"),
    [actions],
  );
  const pending = useMemo(
    () => visible.filter((a) => a.status === "PENDING"),
    [visible],
  );
  const completedCount = visible.filter((a) => a.status === "COMPLETED").length;
  const total = visible.length;
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [comment, setComment] = useState("");

  const pendingKey = pending.map((a) => a.id).join("|");

  useEffect(() => {
    setCheckedIds(new Set());
  }, [pendingKey]);

  if (total === 0) return null;

  const allPendingChecked =
    pending.length > 0 && pending.every((a) => checkedIds.has(a.id));
  const canMarkComplete = unlocked && allPendingChecked && !busy;

  function toggle(actionId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
  }

  return (
    <View style={[styles.card, !unlocked && styles.cardLocked]}>
      {failSummary ? (
        <View style={styles.failBanner}>
          <View style={styles.failHead}>
            <Text style={styles.failIcon}>⚠</Text>
            <Text style={styles.failTitle}>FAIL</Text>
          </View>
          <Text style={styles.failDetail}>{failSummary.replace(/^FAIL:\s*/i, "")}</Text>
        </View>
      ) : null}

      <Text style={styles.title}>Corrective Action</Text>
      <Text style={styles.selectHint}>Select all that apply:</Text>
      {!unlocked && lockedHint ? <Text style={styles.hint}>{lockedHint}</Text> : null}

      {unlocked ? (
        <View style={styles.list}>
          {visible.map((action) => {
            const done = action.status === "COMPLETED";
            const isPending = action.status === "PENDING";
            const checked = done || checkedIds.has(action.id);
            const glyph = actionGlyph(action.title);

            return (
              <Pressable
                key={action.id}
                style={[styles.stepRow, done && styles.stepRowDone]}
                disabled={!unlocked || busy || !isPending}
                onPress={() => {
                  if (isPending) toggle(action.id);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: !isPending }}
              >
                <View style={styles.stepIcon}>
                  <Text style={styles.stepIconGlyph}>{glyph}</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>
                    {action.title}
                  </Text>
                </View>
                <View
                  style={[
                    styles.checkbox,
                    checked && styles.checkboxOn,
                    done && styles.checkboxDone,
                  ]}
                >
                  {checked ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {unlocked ? (
        <View style={styles.commentsBlock}>
          <Text style={styles.commentsLabel}>Comments (optional)</Text>
          <TextInput
            style={styles.commentsInput}
            placeholder="Add a comment..."
            placeholderTextColor={colors.muted}
            value={comment}
            onChangeText={setComment}
            multiline
            editable={!busy}
          />
        </View>
      ) : null}

      {unlocked && pending.length > 0 ? (
        <Pressable
          style={[styles.btn, !canMarkComplete && styles.btnDisabled]}
          disabled={!canMarkComplete}
          onPress={onCompleteAll}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Complete & Continue ›</Text>
          )}
        </Pressable>
      ) : null}

      {unlocked && pending.length === 0 && completedCount >= total ? (
        <Text style={styles.done}>All steps in this phase are complete.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardLocked: {
    opacity: 0.72,
  },
  failBanner: {
    backgroundColor: colors.failSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  failHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  failIcon: {
    fontSize: 14,
    color: colors.fail,
    fontWeight: "900",
  },
  failTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.fail,
    letterSpacing: 0.4,
  },
  failDetail: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.fail,
    lineHeight: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 4,
  },
  selectHint: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.ink,
    marginBottom: 10,
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
    lineHeight: 18,
  },
  list: {
    gap: 8,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepRowDone: {
    opacity: 0.7,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  stepIconGlyph: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  checkboxDone: {
    borderColor: colors.pass,
    backgroundColor: colors.pass,
  },
  checkMark: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 15,
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  stepTitleDone: {
    color: colors.muted,
  },
  commentsBlock: {
    marginTop: 16,
  },
  commentsLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 8,
  },
  commentsInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  done: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "700",
    color: colors.pass,
  },
  btn: {
    marginTop: 16,
    alignSelf: "stretch",
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
});
