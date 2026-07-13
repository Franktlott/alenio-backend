import React from "react";
import { StyleSheet, View } from "react-native";
import { AUTH_LOADING_COLORS, AUTH_LOADING_STEPS, stepStatusAt } from "./types";
import { LoadingStep } from "./LoadingStep";

type ProgressChecklistProps = {
  /** Index of the currently active step (0–3). When allDone, all show checkmarks. */
  activeIndex: number;
  allDone?: boolean;
};

const ICONS = ["lock", "users", "sync", "dashboard"] as const;

export function ProgressChecklist({ activeIndex, allDone = false }: ProgressChecklistProps) {
  return (
    <View style={styles.card} testID="auth-loading-progress">
      {AUTH_LOADING_STEPS.map((step, index) => (
        <LoadingStep
          key={step.id}
          title={step.title}
          icon={ICONS[index]!}
          status={stepStatusAt(index, activeIndex, allDone)}
          isLast={index === AUTH_LOADING_STEPS.length - 1}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: AUTH_LOADING_COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
});
