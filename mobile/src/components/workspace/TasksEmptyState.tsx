import { Image, StyleSheet, Text, View } from "react-native";
import { ClipboardList, Plus } from "lucide-react-native";
import { Button, buttonInk, EmptyState, tintInk } from "@/components/ui";
import { palette } from "@/theme";

type Props = {
  title: string;
  accentTitle?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** First-run blank list, not a filtered or search miss. */
  welcome?: boolean;
};

/** Empty list state — centers in the pane beside the detail empty. */
export function TasksEmptyState({
  title,
  accentTitle,
  subtitle,
  actionLabel,
  onAction,
  welcome = false,
}: Props) {
  if (welcome) {
    return (
      <View style={styles.welcome} testID="empty-state">
        <View style={styles.welcomeBody}>
          <Image
            source={require("@/assets/alenio-empty-tasks.png")}
            style={styles.art}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessibilityLabel="A checklist"
          />
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.body}>{subtitle}</Text> : null}
          {onAction && actionLabel ? (
            <Button
              variant="primary"
              size="sm"
              label={actionLabel}
              icon={
                <Plus size={13} color={buttonInk("primary")} strokeWidth={2.5} />
              }
              onPress={onAction}
              testID="empty-state-action"
              style={styles.button}
            />
          ) : null}
        </View>
      </View>
    );
  }

  const combinedTitle = accentTitle
    ? `${title} ${accentTitle}`.replace(/\s+/g, " ").trim()
    : title;

  return (
    <EmptyState
      testID="empty-state"
      tint="lavender"
      icon={<ClipboardList size={18} color={tintInk("lavender")} strokeWidth={2.2} />}
      title={combinedTitle}
      body={subtitle}
      actionLabel={actionLabel}
      onAction={onAction}
      style={{
        alignSelf: "stretch",
        paddingVertical: 22,
      }}
    />
  );
}

const styles = StyleSheet.create({
  welcome: {
    alignSelf: "stretch",
  },
  welcomeBody: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 8,
  },
  art: {
    width: 88,
    height: 76,
  },
  title: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: palette.ink,
    textAlign: "center",
  },
  body: {
    marginTop: 4,
    maxWidth: 280,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: palette.inkSecondary,
    textAlign: "center",
  },
  button: {
    alignSelf: "center",
    marginTop: 12,
  },
});
