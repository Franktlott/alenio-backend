import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Field, Muted, PrimaryButton, Screen, Title } from "../components/ui";
import { signInWithEmail } from "../lib/auth";
import { useSession } from "../lib/session-context";
import { colors } from "../lib/theme";

export default function SignInScreen() {
  const { refresh } = useSession();
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
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.hero}>
          <Text style={styles.brand}>Alenio Temps</Text>
          <Title>Take checks on the floor</Title>
          <Muted>Sign in with your Alenio account. Managers review results in Alenio Go.</Muted>
        </View>
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
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: 8, marginTop: 24 },
  brand: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.brandDark,
    marginBottom: 8,
  },
});
