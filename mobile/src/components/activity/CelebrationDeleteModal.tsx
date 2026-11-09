import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { getCelebrationCardTheme } from "./celebration-themes";

type Props = {
  visible: boolean;
  celebrationType?: string | null;
  targetName?: string | null;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CelebrationDeleteModal({
  visible,
  celebrationType,
  targetName,
  isDeleting = false,
  onCancel,
  onConfirm,
}: Props) {
  const theme = getCelebrationCardTheme(celebrationType ?? undefined);
  const Icon = theme.Icon;
  const recognized = targetName?.trim() || "this teammate";

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Delete celebration?"
      subtitle="This recognition will be removed from Activity."
      onClose={() => {
        if (!isDeleting) onCancel();
      }}
      compact
      showCloseButton
      scrollEnabled={false}
      testID="delete-celebration-sheet"
      footer={
        <View style={styles.actions}>
          <Pressable
            onPress={onCancel}
            disabled={isDeleting}
            style={({ pressed }) => [
              styles.btn,
              styles.btnCancel,
              pressed && styles.btnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.btnCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={isDeleting}
            style={({ pressed }) => [
              styles.btn,
              styles.btnDelete,
              pressed && styles.btnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Delete celebration"
            testID="confirm-delete-celebration"
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.btnDeleteText}>Delete</Text>
            )}
          </Pressable>
        </View>
      }
    >
      <View style={styles.celebrationChip}>
        <LinearGradient
          colors={theme.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.celebrationIcon}
        >
          <Icon size={16} color="#FFFFFF" strokeWidth={2.4} />
        </LinearGradient>
        <View style={styles.celebrationCopy}>
          <Text style={styles.celebrationName}>{theme.label}</Text>
          <Text style={styles.celebrationMeta} numberOfLines={1}>
            For {recognized}
          </Text>
        </View>
      </View>
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  celebrationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  celebrationIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  celebrationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  celebrationName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  celebrationMeta: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94A3B8",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  btnCancel: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  btnDelete: {
    backgroundColor: "#DC2626",
  },
  btnPressed: {
    opacity: 0.82,
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  btnDeleteText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
