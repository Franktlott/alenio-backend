import { Image, View } from "react-native";
import { EmptySection } from "@/components/ui/EmptySection";
import { colors, radii } from "@/theme";

type Props = {
  title: string;
  accentTitle?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Compact empty — Apple Enterprise EmptySection (no large illustration). */
export function TasksEmptyState({
  title,
  accentTitle,
  subtitle,
  actionLabel,
  onAction,
}: Props) {
  const combinedTitle = accentTitle ? `${title} ${accentTitle}`.replace(/\s+/g, " ").trim() : title;

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        alignSelf: "stretch",
        justifyContent: "center",
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.borderCard,
      }}
    >
      <Image
        source={require("@/assets/alenio-empty-tasks.png")}
        style={{
          width: 132,
          height: 132,
          marginBottom: -8,
          alignSelf: "center",
        }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <EmptySection
        title={combinedTitle}
        body={subtitle}
        actionLabel={actionLabel}
        onAction={onAction}
        testID="empty-state"
      />
    </View>
  );
}
