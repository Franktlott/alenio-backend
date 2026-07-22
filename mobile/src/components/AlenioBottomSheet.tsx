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
  Dimensions,
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
  const bottomPad = Math.max(insets.bottom, compact ? 10 : 20) + (compact ? 4 : 12);
  const bodyMaxHeight = Math.round(Dimensions.get("window").height * (compact ? 0.5 : 0.58));

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
            style={[styles.bodyScroll, { maxHeight: bodyMaxHeight }]}
            contentContainerStyle={[
              styles.bodyContent,
              compact ? styles.bodyContentCompact : null,
              styles.bodyContentGrow,
            ]}
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
  compact = true,
  tint,
  testID,
}: {
  icon: React.ReactNode;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  compact?: boolean;
  tint?: "blue" | "purple" | "slate" | "danger";
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button">
      <AlenioSheetCard
        tint={destructive ? "danger" : tint ?? "blue"}
        compact={compact}
      >
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
    gap: 10,
  },
  optionRowCompact: {
    gap: 8,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  optionTitleCompact: {
    fontSize: 13,
  },
  optionSubtitle: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 1,
    lineHeight: 15,
  },
  optionSubtitleCompact: {
    fontSize: 11,
    marginTop: 1,
    lineHeight: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#0F172A",
  },
  primaryButton: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: "#4361EE",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 6,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 12,
    color: "#B91C1C",
    lineHeight: 16,
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
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: "100%",
    flexGrow: 0,
  },
  sheetCompact: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 12,
  },
  handleCompact: {
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  headerRowCompact: {
    gap: 8,
    marginBottom: 0,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    marginLeft: 4,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  logoCompact: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  titleCompact: {
    fontSize: 15,
  },
  subtitle: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 1,
    lineHeight: 15,
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
    gap: 8,
    paddingTop: 10,
    paddingBottom: 2,
  },
  bodyContentCompact: {
    gap: 6,
    paddingTop: 8,
    paddingBottom: 2,
  },
  bodyContentGrow: {
    flexGrow: 0,
  },
  footer: {
    gap: 2,
    paddingTop: 10,
  },
  footerCompact: {
    gap: 2,
    paddingTop: 6,
  },
  card: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  cardCompact: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconCircleCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
});
