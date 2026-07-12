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
import { X } from "lucide-react-native";
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
  compact?: boolean;
  /** Show an X in the header (useful for form sheets like feedback). */
  showCloseButton?: boolean;
};

function SheetContent({
  title,
  subtitle,
  onClose,
  children,
  footer,
  testID,
  sheetStyle,
  compact = false,
  showCloseButton = false,
}: Omit<Props, "visible" | "asScreen">) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 20) + (compact ? 8 : 12);

  return (
    <View style={styles.backdrop} testID={testID}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <SafeKeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.avoider}
        keyboardVerticalOffset={0}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={[
            styles.sheet,
            compact ? styles.sheetCompact : null,
            { paddingBottom: bottomPad },
            sheetStyle,
          ]}
        >
          <View style={[styles.handle, compact ? styles.handleCompact : null]} />
          <View style={[styles.headerRow, compact ? styles.headerRowCompact : null]}>
            <Image source={require("@/assets/alenio-icon.png")} style={[styles.logo, compact ? styles.logoCompact : null]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, compact ? styles.titleCompact : null]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, compact ? styles.subtitleCompact : null]} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {showCloseButton ? (
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.closeBtn}
                testID="alenio-sheet-close"
              >
                <X size={compact ? 18 : 20} color="#64748B" strokeWidth={2.25} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={[styles.bodyContent, compact ? styles.bodyContentCompact : null]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, compact ? styles.footerCompact : null]}>{footer}</View> : null}
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <SheetContent {...props} />
    </Modal>
  );
}

export function AlenioSheetCard({
  children,
  tint = "blue",
  style,
  compact = false,
}: {
  children: React.ReactNode;
  tint?: "blue" | "purple" | "slate" | "danger";
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const backgroundColor =
    tint === "purple" ? "#F5F3FF" : tint === "slate" ? "#F8FAFC" : tint === "danger" ? "#FEF2F2" : "#EEF2FF";
  return <View style={[styles.card, compact ? styles.cardCompact : null, { backgroundColor }, style]}>{children}</View>;
}

export function AlenioSheetIcon({
  children,
  color = "#4361EE",
  compact = false,
}: {
  children: React.ReactNode;
  color?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.iconCircle, compact ? styles.iconCircleCompact : null, { backgroundColor: color }]}>
      {children}
    </View>
  );
}

export function AlenioSheetOption({
  icon,
  iconColor = "#4361EE",
  title,
  subtitle,
  onPress,
  destructive = false,
  compact = false,
  testID,
}: {
  icon: React.ReactNode;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button">
      <AlenioSheetCard tint={destructive ? "danger" : "blue"} compact={compact}>
        <View style={[alenioSheetStyles.optionRow, compact ? alenioSheetStyles.optionRowCompact : null]}>
          <AlenioSheetIcon color={destructive ? "#EF4444" : iconColor} compact={compact}>
            {icon}
          </AlenioSheetIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[
                alenioSheetStyles.optionTitle,
                compact ? alenioSheetStyles.optionTitleCompact : null,
                destructive ? { color: "#DC2626" } : null,
              ]}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  alenioSheetStyles.optionSubtitle,
                  compact ? alenioSheetStyles.optionSubtitleCompact : null,
                  destructive ? { color: "#F87171" } : null,
                ]}
                numberOfLines={compact ? 1 : 2}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </AlenioSheetCard>
    </Pressable>
  );
}

export const alenioSheetStyles = StyleSheet.create({
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  optionRowCompact: {
    gap: 10,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  optionTitleCompact: {
    fontSize: 14,
  },
  optionSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
    lineHeight: 17,
  },
  optionSubtitleCompact: {
    fontSize: 11,
    marginTop: 1,
    lineHeight: 14,
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
  sheetCompact: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 16,
  },
  handleCompact: {
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  headerRowCompact: {
    gap: 8,
    marginBottom: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    marginLeft: 4,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  logoCompact: {
    width: 26,
    height: 26,
    borderRadius: 7,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  titleCompact: {
    fontSize: 15,
  },
  subtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
    lineHeight: 17,
  },
  subtitleCompact: {
    fontSize: 11,
    marginTop: 1,
    lineHeight: 14,
  },
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    gap: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  bodyContentCompact: {
    gap: 6,
    paddingTop: 8,
    paddingBottom: 2,
  },
  footer: {
    gap: 4,
    paddingTop: 12,
  },
  footerCompact: {
    gap: 2,
    paddingTop: 8,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardCompact: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 0,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconCircleCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});
