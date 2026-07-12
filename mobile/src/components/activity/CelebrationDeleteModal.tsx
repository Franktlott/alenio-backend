import { Image, Modal, Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { getCelebrationCardTheme } from "./celebration-themes";

const alenioIcon = require("@/assets/alenio-icon.png");

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={isDeleting ? undefined : onCancel} accessibilityLabel="Dismiss" />

        <View style={styles.cardWrap}>
          <BlurView intensity={48} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.glassTint]} />

          <View style={styles.content}>
            <View style={styles.brandRow}>
              <Image source={alenioIcon} style={styles.brandMark} accessibilityLabel="Alenio" />
              <Text style={styles.brandText}>Alenio</Text>
            </View>

            <Text style={styles.title}>Delete celebration?</Text>
            <Text style={styles.body}>This recognition will be removed from Activity.</Text>

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

            <View style={styles.actions}>
              <Pressable
                onPress={onCancel}
                disabled={isDeleting}
                style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && styles.btnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                disabled={isDeleting}
                style={({ pressed }) => [styles.btn, styles.btnDelete, pressed && styles.btnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Delete celebration"
                testID="confirm-delete-celebration"
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={styles.btnDeleteText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  cardWrap: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  glassTint: {
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 10,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  brandMark: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  brandText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4361EE",
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    fontWeight: "500",
  },
  celebrationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(248,250,252,0.92)",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
    marginTop: 2,
    marginBottom: 4,
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
    marginTop: 4,
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
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.95)",
  },
  btnDelete: {
    backgroundColor: "rgba(254,242,242,0.95)",
    borderWidth: 1,
    borderColor: "rgba(254,202,202,0.95)",
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
    color: "#DC2626",
  },
});
