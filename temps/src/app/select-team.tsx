import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTabHeader } from "../components/AppTabHeader";
import { Card, Muted, Screen } from "../components/ui";
import { useSession } from "../lib/session-context";
import { listTeams } from "../lib/temps-api";
import type { Team } from "../lib/types";
import { colors } from "../lib/theme";

export default function SelectTeamScreen() {
  const { setTeamId } = useSession();
  const insets = useSafeAreaInsets();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listTeams();
        if (!cancelled) setTeams(rows);
      } catch (err) {
        Alert.alert("Could not load workspaces", err instanceof Error ? err.message : "Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(team: Team) {
    await setTeamId(team.id);
    router.replace("/(app)/today");
  }

  return (
    <View style={styles.shell}>
      <AppTabHeader topInset={insets.top} testID="temps-select-team-header" />
      <Screen style={styles.body}>
        <Text style={styles.title}>Choose workspace</Text>
        <Muted>Temperature checks sync to this workspace’s Alenio Go Temps module.</Muted>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.brand} />
        ) : (
          <FlatList
            style={{ marginTop: 20 }}
            data={teams}
            keyExtractor={(t) => t.id}
            ListEmptyComponent={<Muted>No workspaces found for this account.</Muted>}
            renderItem={({ item }) => (
              <Card onPress={() => void pick(item)}>
                <View style={styles.row}>
                  <Text style={styles.teamName}>{item.name}</Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Card>
            )}
          />
        )}
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teamName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  chevron: {
    fontSize: 20,
    color: colors.muted,
    fontWeight: "300",
  },
});
