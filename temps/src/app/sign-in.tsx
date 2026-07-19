import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTabHeader } from "../components/AppTabHeader";
import { Field, Muted, PrimaryButton, Screen } from "../components/ui";
import { signInWithEmail } from "../lib/auth";
import { useSession } from "../lib/session-context";
import { colors } from "../lib/theme";

export default function SignInScreen() {
  const { refresh } = useSession();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Enter email and password.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      await refresh();
      router.replace("/select-team");
    } catch (err) {
      Alert.alert("Sign-in failed", err instanceof Error ? err.message : "Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.shell}>
      <AppTabHeader topInset={insets.top} testID="temps-sign-in-header" />
      <Screen style={styles.body}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.hero}>
            <Text style={styles.title}>Sign in</Text>
            <Muted>Use your Alenio account. Managers review results in Alenio Go.</Muted>
          </View>
          <View style={styles.card}>
            <Field
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
            />
            <Field
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => void onSubmit()}
            />
            <PrimaryButton label="Sign in" onPress={() => void onSubmit()} loading={loading} />
          </View>
        </KeyboardAvoidingView>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    paddingTop: 16,
  },
  hero: { marginBottom: 20, marginTop: 8 },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.inkOnDark,
  },
  card: {
    backgroundColor: colors.surfaceDark,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 14,
    paddingTop: 2,
  },
});
