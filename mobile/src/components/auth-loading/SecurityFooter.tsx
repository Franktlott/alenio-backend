import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { AUTH_LOADING_COLORS } from "./types";

export function SecurityFooter() {
  return (
    <View style={styles.row} testID="auth-loading-security-footer">
      <ShieldCheck size={14} color={AUTH_LOADING_COLORS.brandPurple} strokeWidth={2.4} />
      <Text style={styles.text}>Your data is secure and encrypted</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 8,
    paddingBottom: 4,
  },
  text: {
    fontSize: 12,
    color: AUTH_LOADING_COLORS.footer,
    fontWeight: "500",
  },
});
