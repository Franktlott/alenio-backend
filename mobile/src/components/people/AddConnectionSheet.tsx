import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Check, Clock, Search, UserPlus, X } from "lucide-react-native";
import { toast } from "burnt";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api/api";
import type { PersonSearchResult } from "@/lib/types";
import { colors } from "@/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function AddConnectionSheet({ visible, onClose }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  useEffect(() => {
    if (!visible) {
      setQuery("");
      return;
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => inputRef.current?.focus()),
    );
  }, [visible]);

  const {
    data: results = [],
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["user-search", trimmed],
    queryFn: () =>
      api.get<PersonSearchResult[]>(
        `/api/users/search?q=${encodeURIComponent(trimmed)}`,
      ),
    enabled: visible && trimmed.length >= 2,
  });

  const connectionMutation = useMutation({
    mutationFn: ({
      userId,
      action,
    }: {
      userId: string;
      action: "request" | "accept";
    }) => api.post(`/api/connections/${action}`, { userId }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({ queryKey: ["connection-suggestions"] });
      void queryClient.invalidateQueries({ queryKey: ["user-search"] });
      toast({
        title:
          variables.action === "accept"
            ? "Connection accepted"
            : "Connection request sent",
        preset: "done",
      });
    },
    onError: (error: Error) =>
      toast({
        title: error.message || "Could not update connection",
        preset: "error",
      }),
  });

  const openPerson = (userId: string) => {
    onClose();
    router.push({ pathname: "/person", params: { userId } });
  };

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Add Connection"
      subtitle="Find people across Alenio by name or username."
      onClose={onClose}
      showCloseButton
      bodyHeightRatio={0.68}
      showScrollIndicator={results.length > 5}
      testID="add-connection-sheet"
    >
      <View style={styles.searchWrap}>
        <Search size={17} color="#8290A6" strokeWidth={2.2} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or @username"
          placeholderTextColor="#98A3B5"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel="Search Alenio people"
          testID="add-connection-search"
        />
        {trimmed.length > 0 ? (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <X size={16} color="#98A3B5" />
          </Pressable>
        ) : null}
      </View>

      {trimmed.length < 2 ? (
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <UserPlus size={25} color={colors.brand} strokeWidth={2} />
          </View>
          <Text style={styles.introTitle}>Grow your Alenio network</Text>
          <Text style={styles.introCopy}>
            Search for a teammate, colleague, or friend and send a connection
            request.
          </Text>
        </View>
      ) : isFetching ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingText}>Searching Alenio…</Text>
        </View>
      ) : isError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Search unavailable</Text>
          <Text style={styles.emptyCopy}>Please try again in a moment.</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No people found</Text>
          <Text style={styles.emptyCopy}>
            Check the spelling or try a different username.
          </Text>
        </View>
      ) : (
        <View style={styles.results}>
          <Text style={styles.resultsLabel}>
            {results.length} RESULT{results.length === 1 ? "" : "S"}
          </Text>
          <View style={styles.resultsCard}>
            {results.map((person, index) => {
              const canRequest =
                person.connectionStatus === "none" ||
                person.connectionStatus === "declined";
              const canAccept = person.connectionStatus === "pending_incoming";
              const busy = Boolean(
                connectionMutation.isPending &&
                  connectionMutation.variables?.userId === person.id,
              );

              return (
                <View key={person.id}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <View style={styles.personRow}>
                    <Pressable
                      onPress={() => openPerson(person.id)}
                      style={styles.personMain}
                      accessibilityRole="button"
                    >
                      <UserAvatar
                        user={person}
                        size={46}
                        radius={23}
                        backgroundColor="#EEF2FF"
                        textColor={colors.brand}
                        fontSize={15}
                      />
                      <View style={styles.personCopy}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {person.name?.trim() || "Alenio member"}
                        </Text>
                        <Text style={styles.personMeta} numberOfLines={1}>
                          {person.username
                            ? `@${person.username}`
                            : person.sharedWorkspaceName ?? "Alenio"}
                        </Text>
                      </View>
                    </Pressable>

                    {canRequest || canAccept ? (
                      <Pressable
                        onPress={() =>
                          connectionMutation.mutate({
                            userId: person.id,
                            action: canAccept ? "accept" : "request",
                          })
                        }
                        disabled={busy}
                        style={styles.connectButton}
                        accessibilityRole="button"
                        accessibilityLabel={
                          canAccept
                            ? `Accept ${person.name ?? "connection"}`
                            : `Connect with ${person.name ?? "person"}`
                        }
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={colors.brand} />
                        ) : (
                          <>
                            {canAccept ? (
                              <Check size={14} color={colors.brand} />
                            ) : (
                              <UserPlus size={14} color={colors.brand} />
                            )}
                            <Text style={styles.connectText}>
                              {canAccept ? "Accept" : "Connect"}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    ) : (
                      <View
                        style={[
                          styles.statusBadge,
                          person.connectionStatus === "connected"
                            ? styles.statusConnected
                            : null,
                        ]}
                      >
                        {person.connectionStatus === "connected" ? (
                          <Check size={12} color="#168A55" />
                        ) : (
                          <Clock size={12} color="#78869A" />
                        )}
                        <Text
                          style={[
                            styles.statusText,
                            person.connectionStatus === "connected"
                              ? styles.statusTextConnected
                              : null,
                          ]}
                        >
                          {person.connectionStatus === "connected"
                            ? "Connected"
                            : "Requested"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E4E9F1",
    backgroundColor: "#F6F8FB",
  },
  searchInput: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    fontSize: 14,
    color: "#111827",
  },
  intro: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 38,
    paddingBottom: 32,
  },
  introIcon: {
    width: 58,
    height: 58,
    marginBottom: 15,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDE5FF",
    backgroundColor: "#F0F4FF",
  },
  introTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#182033",
  },
  introCopy: {
    maxWidth: 270,
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: "#7C899D",
  },
  loadingState: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C899D",
  },
  emptyState: {
    minHeight: 170,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
  },
  emptyCopy: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    color: "#8A96A8",
  },
  results: {
    marginTop: 18,
  },
  resultsLabel: {
    marginBottom: 8,
    marginLeft: 3,
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: "#98A3B5",
  },
  resultsCard: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4E9F1",
    backgroundColor: "#FFFFFF",
  },
  personRow: {
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  personMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#172033",
  },
  personMeta: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    color: "#8390A3",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 69,
    backgroundColor: "#E8ECF2",
  },
  connectButton: {
    minWidth: 82,
    height: 32,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#AFC0FF",
    backgroundColor: "#F8FAFF",
  },
  connectText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.brand,
  },
  statusBadge: {
    height: 29,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 9,
    backgroundColor: "#F1F4F8",
  },
  statusConnected: {
    backgroundColor: "#ECFDF5",
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#78869A",
  },
  statusTextConnected: {
    color: "#168A55",
  },
});
