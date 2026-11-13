import React from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { Bell } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";
import { colors } from "@/theme";

export default function NotificationsScreen() {
  const handleClose = () => router.back();

  return (
    <AlenioBottomSheet
      asScreen
      title="Notification settings"
      subtitle="Choose what Alenio can alert you about"
      onClose={handleClose}
      showCloseButton
      showScrollIndicator
      bodyHeightRatio={0.72}
      testID="notifications-screen"
    >
      <AlenioSheetCard tint="purple">
        <View style={alenioSheetStyles.optionRow}>
          <AlenioSheetIcon color={colors.brand}>
            <Bell size={20} color="#FFFFFF" strokeWidth={2.2} />
          </AlenioSheetIcon>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={alenioSheetStyles.optionTitle}>Stay in the loop</Text>
            <Text style={alenioSheetStyles.optionSubtitle}>
              Preferences sync across devices. System permissions stay in your
              device settings.
            </Text>
          </View>
        </View>
      </AlenioSheetCard>

      <NotificationPreferencesPanel />
    </AlenioBottomSheet>
  );
}
