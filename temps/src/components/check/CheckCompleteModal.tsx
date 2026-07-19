import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { BrandLogo } from "../BrandLogo";
import { colors } from "../../lib/theme";

type Props = {
  visible: boolean;
  onDone: () => void;
};

/** Alenio-branded end-of-check confirmation. */
export function CheckCompleteModal({ visible, onDone }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <BrandLogo width={168} height={42} style={styles.logo} />
          <View style={styles.badge}>
            <Text style={styles.badgeMark}>✓</Text>
          </View>
          <Text style={styles.title}>Check complete</Text>
          <Text style={styles.body}>Results are available in Alenio Go.</Text>
          <Pressable
            style={styles.btn}
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.btnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 31, 68, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: "center",
    shadowColor: "#0B1F44",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  logo: {
    marginBottom: 16,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.passSoft,
    borderWidth: 2,
    borderColor: "#86EFAC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  badgeMark: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.pass,
    lineHeight: 30,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 22,
  },
  btn: {
    alignSelf: "stretch",
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
