import { router } from "expo-router";
import { Alert, Text, View } from "react-native";
import { Card, Muted, PrimaryButton, Screen, Title } from "../../components/ui";
import { signOut } from "../../lib/auth";
import { useSession } from "../../lib/session-context";
import { colors } from "../../lib/theme";

export default function MoreScreen() {
  const { setToken, setTeamId, teamId } = useSession();

  async function onSignOut() {
    await signOut();
    setToken(null);
    await setTeamId(null);
    router.replace("/sign-in");
  }

  return (
    <Screen>
      <Title>More</Title>
      <Muted>Alenio Temps is for taking checks. Library, schedules, and day results live in Alenio Go.</Muted>

      <Card>
        <Text style={{ fontWeight: "700", color: colors.ink }}>Product roles</Text>
        <Text style={{ marginTop: 8, color: colors.muted, lineHeight: 20 }}>
          • This app — record scheduled temperature checks{"\n"}
          • Alenio Go — Item Library, manual entry when needed, review today’s results
        </Text>
      </Card>

      <View style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 13, color: colors.muted }}>Workspace ID</Text>
        <Text style={{ fontWeight: "600", color: colors.ink, marginTop: 4 }}>{teamId ?? "—"}</Text>
      </View>

      {__DEV__ ? (
        <PrimaryButton
          label="Probe lab (dev)"
          onPress={() => router.push("./probe-lab")}
        />
      ) : null}

      <PrimaryButton
        label="Switch workspace"
        onPress={() => {
          void setTeamId(null).then(() => router.replace("/select-team"));
        }}
      />
      <PrimaryButton
        label="Sign out"
        onPress={() => {
          Alert.alert("Sign out?", undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => void onSignOut() },
          ]);
        }}
      />
    </Screen>
  );
}
