import React from "react";
import { View, Text, Pressable } from "react-native";
import { colors, radii, space, typography } from "@/theme";

type EmptySectionProps = {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

/** Compact contextual empty — Chat density. */
export function EmptySection({ title, body, actionLabel, onAction, testID }: EmptySectionProps) {
  return (
    <View
      testID={testID}
      style={{
        marginHorizontal: space.pagePad,
        paddingVertical: space.lg,
        paddingHorizontal: space.md,
        alignItems: "center",
      }}
    >
      <Text style={{ ...typography.rowTitle, textAlign: "center", marginBottom: body ? 2 : 0 }}>{title}</Text>
      {body ? (
        <Text
          style={{
            ...typography.rowSubtitle,
            textAlign: "center",
            maxWidth: 280,
            marginBottom: onAction ? 10 : 0,
            marginTop: 0,
          }}
        >
          {body}
        </Text>
      ) : null}
      {onAction && actionLabel ? (
        <Pressable
          onPress={onAction}
          testID={testID ? `${testID}-action` : undefined}
          style={({ pressed }) => ({
            backgroundColor: colors.brand,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radii.card,
            opacity: pressed ? 0.85 : 1,
            minHeight: 36,
            justifyContent: "center",
          })}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
