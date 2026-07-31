import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Clock, Search, UserPlus, X } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { UserAvatar } from "@/components/UserAvatar";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import type {
  ConnectionEntry,
  ConnectionsResponse,
  Conversation,
  PersonSearchResult,
} from "@/lib/types";

const BRAND = "#4361EE";
const MAX_RECENTS = 8;

/**
 * Team tab for someone who belongs to no workspace. Connections and recent chat
 * participants are shown separately on purpose: being in a conversation with
 * someone is not the same relationship as being connected to them.
 */
export function ZeroWorkspaceTeamHome({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
  });

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["user-search", trimmed],
    queryFn: () => api.get<PersonSearchResult[]>(`/api/users/search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length >= 2,
  });

  const respond = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: "accept" | "decline" }) =>
      api.post(`/api/connections/${action}`, { userId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (err: unknown) => {
      toast({ title: err instanceof Error ? err.message : "Something went wrong", preset: "error" });
    },
  });

  const accepted = useMemo(() => connections?.accepted ?? [], [connections]);
  const incoming = connections?.incoming ?? [];

  // Everyone you already talk to, minus people who are already connections.
  const recentlyMessaged = useMemo(() => {
    const connectedIds = new Set(accepted.map((entry) => entry.person.id));
    const seen = new Set<string>();
    const people: { id: string; name: string | null; image: string | null }[] = [];

    for (const conversation of conversations) {
      const participants = conversation.participants ?? [];
      const fallback = conversation.recipient ? [conversation.recipient] : [];
      for (const person of participants.length > 0 ? participants : fallback) {
        if (!person?.id || person.id === currentUserId) continue;
        if (connectedIds.has(person.id) || seen.has(person.id)) continue;
        seen.add(person.id);
        people.push({ id: person.id, name: person.name ?? null, image: person.image ?? null });
        if (people.length >= MAX_RECENTS) return people;
      }
    }
    return people;
  }, [conversations, accepted, currentUserId]);

  const openPerson = (userId: string) => router.push({ pathname: "/person", params: { userId } });

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      testID="zero-workspace-team-home"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: "#FFFFFF",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E6EAF2",
          paddingHorizontal: 14,
          height: 46,
        }}
      >
        <Search size={15} color="#94A3B8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people or @username"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, fontSize: 14, color: "#0F172A", padding: 0 }}
          testID="zero-workspace-people-search"
        />
        {searching ? <ActivityIndicator size="small" color="#94A3B8" /> : null}
        {trimmed.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <X size={15} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

      {trimmed.length >= 2 ? (
        <Section title="Results">
          {searchResults.length === 0 && !searching ? (
            <EmptyLine text="No people found." />
          ) : (
            searchResults.map((person) => (
              <PersonRow
                key={person.id}
                name={person.name}
                image={person.image}
                subtitle={person.username ? `@${person.username}` : person.sharedWorkspaceName}
                onPress={() => openPerson(person.id)}
                trailing={
                  person.connectionStatus === "connected" ? (
                    <Badge tone="success" icon={Check} label="Connected" />
                  ) : person.connectionStatus === "pending_outgoing" ? (
                    <Badge tone="muted" icon={Clock} label="Requested" />
                  ) : null
                }
                testID={`zero-workspace-search-result-${person.id}`}
              />
            ))
          )}
        </Section>
      ) : (
        <>
          {incoming.length > 0 ? (
            <Section title="Connection requests">
              {incoming.map((entry) => (
                <IncomingRequestRow
                  key={entry.id}
                  entry={entry}
                  busy={respond.isPending}
                  onOpen={() => openPerson(entry.person.id)}
                  onAccept={() => respond.mutate({ userId: entry.person.id, action: "accept" })}
                  onDecline={() => respond.mutate({ userId: entry.person.id, action: "decline" })}
                />
              ))}
            </Section>
          ) : null}

          <Section title="Connections">
            {accepted.length === 0 ? (
              <EmptyLine text="Search above to find people and send your first connection request." />
            ) : (
              accepted.map((entry) => (
                <PersonRow
                  key={entry.id}
                  name={entry.person.name}
                  image={entry.person.image}
                  subtitle={entry.person.username ? `@${entry.person.username}` : null}
                  onPress={() => openPerson(entry.person.id)}
                  testID={`zero-workspace-connection-${entry.person.id}`}
                />
              ))
            )}
          </Section>

          {recentlyMessaged.length > 0 ? (
            <Section title="Recently messaged">
              {recentlyMessaged.map((person) => (
                <PersonRow
                  key={person.id}
                  name={person.name}
                  image={person.image}
                  subtitle={null}
                  onPress={() => openPerson(person.id)}
                  testID={`zero-workspace-recent-${person.id}`}
                />
              ))}
            </Section>
          ) : null}

          <Section title="Workspaces">
            <ProfileCard style={{ padding: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: "#EEF2FF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Building2 size={17} color={BRAND} strokeWidth={2.25} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#182033" }}>
                    Join or create a workspace
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 11, lineHeight: 15, color: "#69758C" }}>
                    Workspaces add shared tasks, schedules and team coaching. Your account, chats and
                    connections stay yours either way.
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <Pressable
                  onPress={() => router.push("/onboarding?mode=join")}
                  style={{
                    flex: 1,
                    height: 42,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: BRAND,
                  }}
                  testID="zero-workspace-join-button"
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Join</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push("/onboarding?mode=create")}
                  style={{
                    flex: 1,
                    height: 42,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#FFFFFF",
                    borderWidth: 1,
                    borderColor: "#DDE4FF",
                  }}
                  testID="zero-workspace-create-button"
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: BRAND }}>Create</Text>
                </Pressable>
              </View>
            </ProfileCard>
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: "#8B95A5",
          textTransform: "uppercase",
          letterSpacing: 0.3,
          marginBottom: 8,
          paddingHorizontal: 4,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <Text style={{ paddingHorizontal: 4, fontSize: 12, lineHeight: 17, color: "#94A3B8" }}>{text}</Text>
  );
}

function PersonRow({
  name,
  image,
  subtitle,
  onPress,
  trailing,
  testID,
}: {
  name: string | null;
  image: string | null;
  subtitle: string | null;
  onPress: () => void;
  trailing?: React.ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#EDF0F6",
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 8,
      }}
      testID={testID}
    >
      <UserAvatar
        user={{ name, image }}
        size={38}
        radius={19}
        backgroundColor="#EEF2FF"
        textColor={BRAND}
        fontSize={15}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
          {name ?? "Alenio member"}
        </Text>
        {subtitle ? (
          <Text style={{ marginTop: 1, fontSize: 11, color: "#7A869A" }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

function Badge({
  tone,
  icon: Icon,
  label,
}: {
  tone: "success" | "muted";
  icon: typeof Check;
  label: string;
}) {
  const success = tone === "success";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: success ? "#ECFDF5" : "#F1F5F9",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Icon size={11} color={success ? "#059669" : "#64748B"} strokeWidth={2.5} />
      <Text style={{ fontSize: 10, fontWeight: "700", color: success ? "#059669" : "#64748B" }}>
        {label}
      </Text>
    </View>
  );
}

function IncomingRequestRow({
  entry,
  busy,
  onOpen,
  onAccept,
  onDecline,
}: {
  entry: ConnectionEntry;
  busy: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#EDF0F6",
        padding: 12,
        marginBottom: 8,
      }}
      testID={`zero-workspace-request-${entry.person.id}`}
    >
      <Pressable onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <UserAvatar
          user={{ name: entry.person.name, image: entry.person.image }}
          size={38}
          radius={19}
          backgroundColor="#EEF2FF"
          textColor={BRAND}
          fontSize={15}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
            {entry.person.name ?? "Alenio member"}
          </Text>
          {entry.person.username ? (
            <Text style={{ marginTop: 1, fontSize: 11, color: "#7A869A" }} numberOfLines={1}>
              @{entry.person.username}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Pressable
          onPress={onAccept}
          disabled={busy}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 6,
            backgroundColor: BRAND,
          }}
          testID={`zero-workspace-accept-${entry.person.id}`}
        >
          <UserPlus size={13} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>Accept</Text>
        </Pressable>
        <Pressable
          onPress={onDecline}
          disabled={busy}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#F1F5F9",
          }}
          testID={`zero-workspace-decline-${entry.person.id}`}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569" }}>Decline</Text>
        </Pressable>
      </View>
    </View>
  );
}