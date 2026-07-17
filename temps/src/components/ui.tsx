import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { colors } from "../lib/theme";

export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.screen, style]} {...rest}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: string }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryBtn,
        (disabled || loading) && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.btnPressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  muted: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
  },
  input: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.ink,
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.88 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
});
