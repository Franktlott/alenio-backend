import { StyleSheet, Text, View } from "react-native";
import { QrCode } from "lucide-react-native";
import { WELCOME_UI } from "./welcome-ui";

const styles = StyleSheet.create({
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WELCOME_UI.rowIconBorder,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  codeText: {
    fontSize: 15,
    fontWeight: "700",
    color: WELCOME_UI.primary,
    letterSpacing: 0.5,
  },
});

export function InviteCodeRowIcon() {
  return (
    <View style={styles.iconBox}>
      <Text style={styles.codeText}>123</Text>
    </View>
  );
}

export function QrScanRowIcon() {
  return (
    <View style={styles.iconBox}>
      <QrCode size={20} color={WELCOME_UI.primary} strokeWidth={2.2} />
    </View>
  );
}
