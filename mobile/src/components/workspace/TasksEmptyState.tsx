import { View, Text, Image, Pressable } from "react-native";

type Props = {
  title: string;
  accentTitle?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Centered illustration empty state — matches Growth / Check-in / Member tasks. */
export function TasksEmptyState({
  title,
  accentTitle,
  subtitle,
  actionLabel,
  onAction,
}: Props) {
  return (
    <View
      style={{
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
        alignItems: "center",
        minHeight: 320,
      }}
      testID="empty-state"
    >
      <Image
        source={require("@/assets/tasks-empty-member-v4.png")}
        style={{ width: 168, height: 168, marginBottom: 8 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: "#0F172A",
          textAlign: "center",
          letterSpacing: -0.3,
          lineHeight: 25,
          marginBottom: 8,
          maxWidth: 300,
        }}
      >
        {accentTitle ? (
          <>
            {title}
            {"\n"}
            <Text style={{ color: "#7C3AED" }}>{accentTitle}</Text>
          </>
        ) : (
          title
        )}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontSize: 13.5,
            color: "#64748B",
            textAlign: "center",
            lineHeight: 20,
            maxWidth: 300,
            marginBottom: actionLabel && onAction ? 18 : 0,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={{
            backgroundColor: "#4361EE",
            borderRadius: 12,
            paddingHorizontal: 18,
            paddingVertical: 12,
            maxWidth: 280,
            width: "100%",
            alignItems: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
