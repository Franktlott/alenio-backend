import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Text } from "react-native";
import { Card, Muted, Screen, Title } from "../components/ui";
import { useSession } from "../lib/session-context";
import { listTeams } from "../lib/temps-api";
import type { Team } from "../lib/types";
import { colors } from "../lib/theme";

export default function SelectTeamScreen() {
  const { setTeamId } = useSession();
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
    <Screen>
      <Title>Choose workspace</Title>
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
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.ink }}>{item.name}</Text>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
