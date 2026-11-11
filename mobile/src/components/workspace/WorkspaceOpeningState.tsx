import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import type { Team } from "@/lib/types";

type Props = {
  team: Pick<Team, "name" | "image"> | null;
};

/** Shown only while a newly selected workspace has nothing on screen yet. */
export function WorkspaceOpeningState({ team }: Props) {
  const name = team?.name?.trim() || "Workspace";
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={`Opening ${name}`}
      testID="workspace-opening"
    >
      {team ? (
        <WorkspaceTeamAvatar team={team} size={56} radius={16} />
      ) : (
        <View style={styles.mark} />
      )}
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.line}>Opening workspace</Text>
      <ActivityIndicator color="#5B45FF" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#EFE9FF",
  },
  name: {
    marginTop: 16,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center",
    color: "#111A2B",
  },
  line: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: "#667085",
  },
  spinner: {
    marginTop: 18,
  },
});
