import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";

type Props = {
  visible?: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  asScreen?: boolean;
  testID?: string;
  sheetStyle?: StyleProp<ViewStyle>;
};

function SheetContent({
  title,
  subtitle,
  onClose,
  children,
  footer,
  testID,
  sheetStyle,
}: Omit<Props, "visible" | "asScreen">) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.backdrop} testID={testID}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <SafeKeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.avoider}
        keyboardVerticalOffset={0}
      >
        <Pressable onPress={(e) => e.stopPropagation?.()} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }, sheetStyle]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Image source={require("@/assets/alenio-icon.png")} style={styles.logo} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {children}
            {footer}
          </ScrollView>
        </Pressable>
      </SafeKeyboardAvoidingView>
    </View>
  );
}

export function AlenioBottomSheet({
  visible = true,
  asScreen = false,
  ...props
}: Props) {
  if (asScreen) {
    return <SheetContent {...props} />;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <SheetContent {...props} />
    </Modal>
  );
}

export function AlenioSheetCard({
  children,
  tint = "blue",
  style,
}: {
  children: React.ReactNode;
  tint?: "blue" | "purple" | "slate";
  style?: StyleProp<ViewStyle>;
}) {
  const backgroundColor = tint === "purple" ? "#F5F3FF" : tint === "slate" ? "#F8FAFC" : "#EEF2FF";
  return <View style={[styles.card, { backgroundColor }, style]}>{children}</View>;
}

export function AlenioSheetIcon({
  children,
  color = "#4361EE",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <View style={[styles.iconCircle, { backgroundColor: color }]}>
      {children}
    </View>
  );
}

export const alenioSheetStyles = StyleSheet.create({
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  optionSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
    lineHeight: 17,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  primaryButton: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#4361EE",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 13,
    color: "#B91C1C",
    lineHeight: 18,
  },
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  avoider: {
    width: "100%",
    maxHeight: "92%",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: "100%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
    lineHeight: 17,
  },
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    gap: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
