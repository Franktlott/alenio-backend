import { router, useNavigation } from "expo-router";
import { useLayoutEffect } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTabHeader } from "../../components/AppTabHeader";
import { Card, Muted, PrimaryButton, Screen } from "../../components/ui";
import { signOut } from "../../lib/auth";
import { useSession } from "../../lib/session-context";
import { colors } from "../../lib/theme";

export default function MoreScreen() {
  const { setToken, setTeamId, teamId } = useSession();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  async function onSignOut() {
    await signOut();
    setToken(null);
    await setTeamId(null);
    router.replace("/sign-in");
  }

  return (
    <View style={styles.shell}>
      <AppTabHeader topInset={insets.top} testID="temps-more-header" />
      <Screen style={styles.body}>
        <Text style={styles.title}>More</Text>
        <Muted>
          Alenio Temp is for taking checks. Library, schedules, and day results live in Alenio Go.
        </Muted>

        <View style={{ marginTop: 18 }}>
          <Card>
            <Text style={styles.cardTitle}>Product roles</Text>
            <Text style={styles.cardBody}>
              • This app — record scheduled temperature checks{"\n"}
              • Alenio Go — Item Library, manual entry when needed, review today’s results
            </Text>
          </Card>
        </View>

        <View style={styles.idBlock}>
          <Text style={styles.idLabel}>Workspace ID</Text>
          <Text style={styles.idValue}>{teamId ?? "—"}</Text>
        </View>

        {__DEV__ ? (
          <PrimaryButton
            label="Probe lab (dev)"
            variant="secondary"
            onPress={() => router.push("./probe-lab")}
          />
        ) : null}

        <PrimaryButton
          label="Switch workspace"
          variant="secondary"
          onPress={() => {
            void setTeamId(null).then(() => router.replace("/select-team"));
          }}
        />
        <PrimaryButton
          label="Sign out"
          variant="danger"
          onPress={() => {
            Alert.alert("Sign out?", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => void onSignOut() },
            ]);
          }}
        />
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
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.inkOnDark,
  },
  cardTitle: {
    fontWeight: "700",
    color: colors.ink,
    fontSize: 15,
  },
  cardBody: {
    marginTop: 8,
    color: colors.muted,
    lineHeight: 20,
    fontSize: 14,
  },
  idBlock: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: colors.surfaceDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 14,
  },
  idLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedOnDark,
  },
  idValue: {
    fontWeight: "600",
    color: colors.inkOnDark,
    marginTop: 4,
    fontSize: 13,
  },
});
