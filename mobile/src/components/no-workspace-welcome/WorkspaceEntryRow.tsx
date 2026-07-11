import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { WELCOME_UI } from "./welcome-ui";

type Props = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
};

export function WorkspaceEntryRow({ title, subtitle, icon, onPress, accessibilityLabel, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: WELCOME_UI.rowMinHeight,
        backgroundColor: WELCOME_UI.cardBg,
        borderWidth: 1,
        borderColor: WELCOME_UI.border,
        borderRadius: WELCOME_UI.rowRadius,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        opacity: pressed ? 0.94 : 1,
        alignSelf: "stretch",
        width: "100%",
      })}
    >
      {icon}
      <View style={{ flex: 1, justifyContent: "center", marginRight: 8 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 16, fontWeight: "600", color: WELCOME_UI.heading, marginBottom: 3 }}
        >
          {title}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 13, color: WELCOME_UI.body, lineHeight: 18 }}>
          {subtitle}
        </Text>
      </View>
      <View style={{ flexShrink: 0 }}>
        <ChevronRight size={18} color="#CBD5E1" strokeWidth={2} />
      </View>
    </Pressable>
  );
}
