import { useMemo } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Building2, Plus, Search, UserPlus } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { UserAvatar } from "@/components/UserAvatar";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { suggestionExplanation } from "@/lib/people-directory";
import type { ConnectionSuggestion, ConnectionsResponse } from "@/lib/types";

const BRAND = "#4361EE";

export function ZeroWorkspaceTeamHome({
  onAddConnection,
}: {
  onAddConnection: () => void;
}) {
  const queryClient = useQueryClient();
  const suggestionsKey = ["connection-suggestions", "global"] as const;
  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
  });
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: suggestionsKey,
    queryFn: () =>
      api.get<ConnectionSuggestion[]>("/api/connections/suggestions?limit=20"),
  });
  const accepted = useMemo(() => connections?.accepted ?? [], [connections]);

  const connectMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post("/api/connections/request", { userId }),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: suggestionsKey });
      const previous = queryClient.getQueryData<ConnectionSuggestion[]>(suggestionsKey);
      queryClient.setQueryData<ConnectionSuggestion[]>(suggestionsKey, (current = []) =>
        current.filter((item) => item.person.id !== userId),
      );
      return { previous };
    },
    onError: (error: Error, _userId, context) => {
      if (context?.previous) queryClient.setQueryData(suggestionsKey, context.previous);
      toast({ title: error.message || "Could not send request", preset: "error" });
    },
    onSuccess: () => toast({ title: "Connection request sent", preset: "done" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({ queryKey: ["connection-suggestions"] });
      void queryClient.invalidateQueries({ queryKey: ["user-search"] });
    },
  });

  const openPerson = (userId: string) =>
    router.push({ pathname: "/person", params: { userId } });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="zero-workspace-team-home"
    >
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Your people, beyond a workspace</Text>
        <Text style={styles.introCopy}>
          Connections stay with you even when you are not currently in a workspace.
        </Text>
      </View>

      {accepted.length > 0 ? (
        <Section title="Connections">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.connectionStrip}
            style={styles.horizontalScroll}
          >
            {accepted.map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => openPerson(entry.person.id)}
                style={styles.connectionPerson}
                testID={`zero-workspace-connection-${entry.person.id}`}
              >
                <UserAvatar
                  user={entry.person}
                  size={56}
                  radius={28}
                  backgroundColor="#EEF2FF"
                  textColor={BRAND}
                  fontSize={20}
                />
                <Text style={styles.connectionName} numberOfLines={1}>
                  {firstName(entry.person.name)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      <Section title="Suggested for you">
        {isLoading ? (
          <ActivityIndicator color={BRAND} style={styles.loading} />
        ) : suggestions.length > 0 ? (
          <View style={styles.suggestionCard}>
            {suggestions.map((suggestion, index) => (
              <View key={suggestion.person.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.suggestionRow}>
                  <Pressable
                    onPress={() => openPerson(suggestion.person.id)}
                    style={styles.suggestionMain}
                  >
                    <UserAvatar
                      user={suggestion.person}
                      size={44}
                      radius={22}
                      backgroundColor="#EEF2FF"
                      textColor={BRAND}
                      fontSize={15}
                    />
                    <View style={styles.suggestionCopy}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {suggestion.person.name?.trim() || "Alenio member"}
                      </Text>
                      <Text style={styles.reason} numberOfLines={2}>
                        {suggestionExplanation(suggestion)}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => connectMutation.mutate(suggestion.person.id)}
                    disabled={Boolean(
                      connectMutation.isPending &&
                        connectMutation.variables === suggestion.person.id,
                    )}
                    style={styles.connectButton}
                    testID={`zero-workspace-connect-${suggestion.person.id}`}
                  >
                    <UserPlus size={13} color={BRAND} />
                    <Text style={styles.connectText}>Connect</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <ProfileCard style={styles.findCard}>
            <View style={styles.findIcon}>
              <Search size={21} color={BRAND} />
            </View>
            <Text style={styles.findTitle}>Find your people</Text>
            <Text style={styles.findCopy}>
              Browse Alenio or search by username to start building your network.
            </Text>
            <View style={styles.findActions}>
              <Pressable
                onPress={onAddConnection}
                style={styles.primaryButton}
                testID="zero-workspace-browse-people"
              >
                <Search size={14} color="#FFFFFF" />
                <Text style={styles.primaryText}>Browse People</Text>
              </Pressable>
              <Pressable
                onPress={onAddConnection}
                style={styles.secondaryButton}
                testID="zero-workspace-search-username"
              >
                <Text style={styles.secondaryText}>Search by Username</Text>
              </Pressable>
            </View>
          </ProfileCard>
        )}
      </Section>

      <Section title="Workspaces">
        <ProfileCard style={styles.workspaceCard}>
          <View style={styles.workspaceTop}>
            <Image
              source={require("@/assets/alenio-empty-workspace.png")}
              resizeMode="contain"
              style={styles.workspaceImage}
            />
            <View style={styles.workspaceCopy}>
              <Text style={styles.workspaceTitle}>Start working together</Text>
              <Text style={styles.workspaceText}>
                Join your team or create a workspace for tasks, calendars, and check-ins.
              </Text>
            </View>
          </View>
          <View style={styles.workspaceActions}>
            <Pressable
              onPress={() => router.push({ pathname: "/onboarding", params: { intent: "add", mode: "join" } })}
              style={styles.primaryButton}
              testID="zero-workspace-join-button"
            >
              <Building2 size={13} color="#FFFFFF" />
              <Text style={styles.primaryText}>Join workspace</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: "/onboarding", params: { intent: "add", mode: "create" } })}
              style={styles.secondaryButton}
              testID="zero-workspace-create-button"
            >
              <Plus size={14} color={BRAND} />
              <Text style={styles.secondaryText}>Create workspace</Text>
            </Pressable>
          </View>
        </ProfileCard>
      </Section>
    </ScrollView>
  );
}

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || "Member";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  intro: { padding: 16, borderRadius: 17, backgroundColor: "#F6F7FF", borderWidth: 1, borderColor: "#E1E5FF" },
  introTitle: { fontSize: 16, fontWeight: "800", color: "#182033" },
  introCopy: { marginTop: 5, fontSize: 11.5, lineHeight: 17, color: "#69758C" },
  section: { marginTop: 20 },
  sectionTitle: { marginBottom: 8, paddingHorizontal: 3, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, color: "#8B95A5" },
  horizontalScroll: { flexGrow: 0 },
  connectionStrip: { gap: 15, paddingHorizontal: 3 },
  connectionPerson: { width: 64, alignItems: "center", gap: 6 },
  connectionName: { width: 64, textAlign: "center", fontSize: 11, fontWeight: "600", color: "#475569" },
  suggestionCard: { overflow: "hidden", borderRadius: 15, borderWidth: 1, borderColor: "#E6EAF0", backgroundColor: "#FFFFFF" },
  suggestionRow: { minHeight: 72, paddingHorizontal: 11, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  suggestionMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  suggestionCopy: { flex: 1, minWidth: 0 },
  personName: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  reason: { marginTop: 3, fontSize: 10.5, lineHeight: 14, color: "#7A869A" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 65, backgroundColor: "#E8ECF2" },
  connectButton: { minWidth: 76, height: 32, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 10, borderWidth: 1, borderColor: "#AFC0FF", backgroundColor: "#F8FAFF" },
  connectText: { fontSize: 10, fontWeight: "700", color: BRAND },
  loading: { marginVertical: 24 },
  findCard: { padding: 18, alignItems: "center", borderColor: "#E1E5FF", backgroundColor: "#FAFAFF" },
  findIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF2FF" },
  findTitle: { marginTop: 10, fontSize: 15, fontWeight: "800", color: "#182033" },
  findCopy: { marginTop: 5, maxWidth: 280, fontSize: 11.5, lineHeight: 17, textAlign: "center", color: "#69758C" },
  findActions: { width: "100%", marginTop: 14, gap: 8 },
  primaryButton: { flex: 1, minHeight: 40, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, backgroundColor: BRAND },
  primaryText: { fontSize: 11.5, fontWeight: "700", color: "#FFFFFF" },
  secondaryButton: { flex: 1, minHeight: 40, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: "#AFC0FF", backgroundColor: "#FFFFFF" },
  secondaryText: { fontSize: 11.5, fontWeight: "700", color: BRAND },
  workspaceCard: { padding: 12, borderRadius: 14, borderColor: "#E1E2FA", backgroundColor: "#F8F7FF" },
  workspaceTop: { flexDirection: "row", alignItems: "center", minHeight: 78 },
  workspaceImage: { width: 88, height: 76, marginRight: 10 },
  workspaceCopy: { flex: 1, minWidth: 0 },
  workspaceTitle: { fontSize: 14, fontWeight: "700", color: "#182033" },
  workspaceText: { marginTop: 4, fontSize: 11, lineHeight: 15, color: "#69758C" },
  workspaceActions: { flexDirection: "row", gap: 8, marginTop: 8 },
});
