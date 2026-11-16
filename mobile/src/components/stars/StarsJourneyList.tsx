import { StyleSheet, Text, View } from "react-native";
import {
  Check,
  Lock,
  Mountain,
  Star,
  Trophy,
  Zap,
} from "lucide-react-native";
import type { StarsJourneyStep } from "@/lib/stars";
import { STARS_GOLD, STARS_PURPLE } from "@/lib/stars";

type Props = {
  steps: StarsJourneyStep[];
  activeRef?: (node: View | null) => void;
  testID?: string;
};

function StepIcon({
  iconKey,
  status,
}: {
  iconKey: StarsJourneyStep["iconKey"];
  status: StarsJourneyStep["status"];
}) {
  const muted = status === "locked";
  const color =
    iconKey === "trophy"
      ? muted
        ? "#FDBA74"
        : "#EA580C"
      : iconKey === "mountain"
        ? STARS_PURPLE
        : STARS_GOLD;
  const size = 18;
  if (iconKey === "bolt") return <Zap size={size} color={color} fill={color} strokeWidth={0} />;
  if (iconKey === "mountain") return <Mountain size={size} color={color} strokeWidth={2.2} />;
  if (iconKey === "trophy") return <Trophy size={size} color={color} strokeWidth={2.2} />;
  return <Star size={size} color={color} fill={color} strokeWidth={0} />;
}

export function StarsJourneyList({
  steps,
  activeRef,
  testID = "stars-journey-list",
}: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.heading}>Your Journey</Text>
      </View>
      <View style={styles.list}>
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const completed = step.status === "completed";
          const active = step.status === "active";
          const locked = step.status === "locked";
          const progressRatio =
            step.progressTarget > 0
              ? Math.min(1, step.progressCurrent / step.progressTarget)
              : 0;

          return (
            <View
              key={step.id}
              style={styles.row}
              testID={`${testID}-step-${step.id}`}
              ref={active ? activeRef : undefined}
              collapsable={false}
            >
              <View style={styles.rail}>
                <View
                  style={[
                    styles.dot,
                    completed ? styles.dotDone : null,
                    active ? styles.dotActive : null,
                    locked ? styles.dotLocked : null,
                  ]}
                >
                  {completed ? (
                    <Check size={12} color="#FFFFFF" strokeWidth={3} />
                  ) : null}
                </View>
                {!isLast ? (
                  <View
                    style={[
                      styles.line,
                      completed ? styles.lineDone : styles.lineTodo,
                    ]}
                  />
                ) : null}
              </View>

              <View
                style={[
                  styles.card,
                  active ? styles.cardActive : null,
                  locked ? styles.cardLocked : null,
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.iconBubble}>
                    <StepIcon iconKey={step.iconKey} status={step.status} />
                  </View>
                  <View style={styles.cardCopy}>
                    <Text
                      style={[styles.cardTitle, locked ? styles.muted : null]}
                    >
                      {step.title}
                    </Text>
                    <Text style={[styles.cardSub, locked ? styles.muted : null]}>
                      {completed
                        ? `${step.threshold} stars earned`
                        : `${step.threshold} stars`}
                    </Text>
                  </View>
                  {completed ? (
                    <View style={styles.badgeDone}>
                      <Text style={styles.badgeDoneText}>Completed</Text>
                    </View>
                  ) : locked ? (
                    <Lock size={16} color="#94A3B8" strokeWidth={2.2} />
                  ) : null}
                </View>

                {active ? (
                  <View style={styles.progressBlock}>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${Math.max(6, progressRatio * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressLabel}>
                      {step.progressCurrent} / {step.progressTarget}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  list: {
    gap: 0,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
  },
  rail: {
    width: 22,
    alignItems: "center",
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#C4B5FD",
    backgroundColor: "#FFFFFF",
  },
  dotDone: {
    backgroundColor: STARS_PURPLE,
    borderColor: STARS_PURPLE,
  },
  dotActive: {
    borderColor: STARS_PURPLE,
    backgroundColor: "#FFFFFF",
  },
  dotLocked: {
    borderColor: "#CBD5E1",
  },
  line: {
    flex: 1,
    width: 2,
    marginTop: 2,
    marginBottom: 2,
    borderRadius: 1,
  },
  lineDone: {
    backgroundColor: STARS_PURPLE,
  },
  lineTodo: {
    backgroundColor: "#E2E8F0",
  },
  card: {
    flex: 1,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  cardActive: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  cardLocked: {
    backgroundColor: "#F8FAFC",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFBEB",
  },
  cardCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  cardSub: {
    fontSize: 12,
    color: "#64748B",
  },
  muted: {
    color: "#94A3B8",
  },
  badgeDone: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
  },
  badgeDoneText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  progressBlock: {
    gap: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E9E5FF",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: STARS_PURPLE,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: STARS_PURPLE,
  },
});
