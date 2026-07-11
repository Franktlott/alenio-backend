import { StyleSheet, Text, View } from "react-native";
import { Lock } from "lucide-react-native";
import { WELCOME_UI } from "./welcome-ui";

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    fontSize: 12,
    color: WELCOME_UI.footerText,
    marginLeft: 6,
  },
});

export function SecurityFooter() {
  return (
    <View style={styles.footer}>
      <Lock size={13} color={WELCOME_UI.primary} strokeWidth={2.4} fill={WELCOME_UI.primary} />
      <Text style={styles.footerText}>Your data is secure and encrypted.</Text>
    </View>
  );
}
