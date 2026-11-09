import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react-native";
import { router } from "expo-router";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api/api";

const BRAND = "#4361EE";

type MutualPerson = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
};

type Props = {
  visible: boolean;
  personId: string;
  personName: string;
  onClose: () => void;
};

export function MutualConnectionsSheet({ visible, personId, personName, onClose }: Props) {
  const firstName = personName.trim().split(/\s+/)[0] || "them";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["mutual-connections", personId],
    queryFn: () => api.get<{ people: MutualPerson[] }>(`/api/connections/person/${personId}/mutual`),
    enabled: visible && personId.length > 0,
  });
  const people = data?.people ?? [];

  const openPerson = (id: string) => {
    onClose();
    router.push({ pathname: "/person", params: { userId: id } });
  };

  return (
    <AlenioBottomSheet
      visible={visible}
      onClose={onClose}
      title="Mutual connections"
      subtitle={`People you and ${firstName} both know`}
      compact
      showCloseButton
      bodyHeightRatio={0.46}
      testID="mutual-connections-sheet"
    >
      {isLoading ? (
        <ActivityIndicator color={BRAND} style={styles.loading} />
      ) : isError ? (
        <Text style={styles.empty}>Could not load mutual connections.</Text>
      ) : people.length === 0 ? (
        <Text style={styles.empty}>You don’t share any connections with {firstName}.</Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {people.map((person, index) => (
            <Pressable
              key={person.id}
              onPress={() => openPerson(person.id)}
              style={[styles.row, index > 0 ? styles.rowDivider : null]}
              accessibilityRole="button"
              accessibilityLabel={person.name ?? "Connection"}
              testID={`mutual-connection-${person.id}`}
            >
              <UserAvatar
                user={{ name: person.name, image: person.image }}
                size={40}
                radius={20}
                backgroundColor="#F3F0FF"
                textColor={BRAND}
                fontSize={14}
              />
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>
                  {person.name ?? "Alenio member"}
                </Text>
                {person.username ? (
                  <Text style={styles.handle} numberOfLines={1}>
                    @{person.username}
                  </Text>
                ) : null}
              </View>
              <ChevronRight size={16} color="#C4B5FD" strokeWidth={2.2} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: 28 },
  empty: {
    paddingVertical: 28,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: "#667085",
  },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8ECF3",
  },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: "#111A2B" },
  handle: { marginTop: 1, fontSize: 13, lineHeight: 17, color: "#667085" },
});
