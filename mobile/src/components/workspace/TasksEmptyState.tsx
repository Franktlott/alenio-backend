import { Image, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  title: string;
  accentTitle?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Same artwork size and type as the Feed empty state. */
export function TasksEmptyState({
  title,
  accentTitle,
  subtitle,
  actionLabel,
  onAction,
}: Props) {
  const combinedTitle = accentTitle
    ? `${title} ${accentTitle}`.replace(/\s+/g, " ").trim()
    : title;

  return (
    <View style={styles.wrap} testID="empty-state">
      <Image
        source={require("@/assets/alenio-empty-tasks-people.png")}
        style={styles.image}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text style={styles.title}>{combinedTitle}</Text>
      {subtitle ? <Text style={styles.body}>{subtitle}</Text> : null}
      {onAction && actionLabel ? (
        <Pressable
          onPress={onAction}
          testID="empty-state-action"
          style={({ pressed }) => [
            styles.action,
            pressed ? styles.actionPressed : null,
          ]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    alignSelf: "stretch",
    flexShrink: 0,
    paddingTop: 18,
    paddingHorizontal: 28,
  },
  image: {
    width: 210,
    height: 210,
    flexShrink: 0,
    marginBottom: -12,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111A2B",
    textAlign: "center",
  },
  body: {
    marginTop: 8,
    maxWidth: 270,
    fontSize: 13,
    lineHeight: 19,
    color: "#7A8699",
    textAlign: "center",
  },
  action: {
    marginTop: 20,
    minWidth: 220,
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 22,
    backgroundColor: "#4361EE",
  },
  actionPressed: { opacity: 0.85 },
  actionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
