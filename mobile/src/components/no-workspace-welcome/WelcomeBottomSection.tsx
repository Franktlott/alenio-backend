import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { WELCOME_UI } from "./welcome-ui";

type RowProps = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
};

export function WorkspaceEntryRow({ title, subtitle, icon, onPress, accessibilityLabel, testID }: RowProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.94}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={styles.row}
    >
      <View style={styles.rowInner}>
        {icon}
        <View style={styles.rowCopy}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        </View>
        <ChevronRight size={18} color="#CBD5E1" strokeWidth={2} />
      </View>
    </TouchableOpacity>
  );
}

export const welcomeActionStyles = StyleSheet.create({
  bottomSection: {
    width: "100%",
    flexShrink: 0,
    paddingHorizontal: WELCOME_UI.marginH,
    paddingTop: 0,
    paddingBottom: 12,
  },
  primaryButton: {
    width: "100%",
    height: WELCOME_UI.buttonHeight,
    borderRadius: WELCOME_UI.buttonRadius,
    backgroundColor: WELCOME_UI.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: 8,
  },
  secondaryButton: {
    width: "100%",
    height: WELCOME_UI.buttonHeight,
    borderRadius: WELCOME_UI.buttonRadius,
    borderWidth: 1,
    borderColor: WELCOME_UI.primary,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: WELCOME_UI.buttonGap,
  },
  secondaryLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: WELCOME_UI.primary,
    marginLeft: 8,
  },
  dividerRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    marginTop: WELCOME_UI.dividerMarginV,
    marginBottom: WELCOME_UI.dividerMarginV,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: WELCOME_UI.border,
  },
  dividerText: {
    fontSize: 14,
    color: WELCOME_UI.dividerText,
    marginHorizontal: 14,
  },
  rowSpacer: {
    height: WELCOME_UI.rowGap,
  },
  footerWrap: {
    width: "100%",
    flexShrink: 0,
    paddingTop: 14,
    paddingBottom: 2,
    alignItems: "center",
  },
  signOutButton: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "600",
    color: WELCOME_UI.body,
  },
  signOutBackdrop: {
    flex: 1,
    backgroundColor: "rgba(23, 32, 51, 0.34)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: WELCOME_UI.marginH,
  },
  signOutCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: WELCOME_UI.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WELCOME_UI.border,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  signOutTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: WELCOME_UI.heading,
    textAlign: "center",
  },
  signOutCopy: {
    fontSize: 14,
    color: WELCOME_UI.bodyMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  signOutActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  signOutCancel: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WELCOME_UI.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  signOutCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: WELCOME_UI.body,
  },
  signOutConfirm: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WELCOME_UI.primary,
  },
  signOutConfirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pendingCard: {
    width: "100%",
    backgroundColor: WELCOME_UI.pendingBg,
    borderWidth: 1,
    borderColor: WELCOME_UI.pendingBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    shadowColor: "#172033",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pendingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  pendingStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: WELCOME_UI.pendingAccentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  pendingStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: WELCOME_UI.pendingAccent,
  },
  pendingStatusLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: WELCOME_UI.pendingAccent,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  pendingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: WELCOME_UI.pendingAccentSoft,
    borderWidth: 1,
    borderColor: "#E0E7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: WELCOME_UI.heading,
    lineHeight: 20,
  },
  pendingWorkspace: {
    fontSize: 14,
    fontWeight: "600",
    color: WELCOME_UI.heading,
    marginTop: 4,
    lineHeight: 20,
  },
  pendingCopy: {
    fontSize: 13,
    lineHeight: 18,
    color: WELCOME_UI.pendingLabel,
    marginTop: 8,
  },
  cancelRequestButton: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WELCOME_UI.border,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: WELCOME_UI.buttonGap,
  },
  cancelRequestText: {
    fontSize: 15,
    fontWeight: "600",
    color: WELCOME_UI.body,
  },
});

const styles = StyleSheet.create({
  row: {
    width: "100%",
    minHeight: WELCOME_UI.rowMinHeight,
    backgroundColor: WELCOME_UI.cardBg,
    borderWidth: 1,
    borderColor: WELCOME_UI.border,
    borderRadius: WELCOME_UI.rowRadius,
  },
  rowInner: {
    width: "100%",
    minHeight: WELCOME_UI.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowCopy: {
    flex: 1,
    marginRight: 8,
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: WELCOME_UI.heading,
    marginBottom: 3,
  },
  rowSubtitle: {
    fontSize: 12,
    color: WELCOME_UI.body,
    lineHeight: 16,
  },
});
