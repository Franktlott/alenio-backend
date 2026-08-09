import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, Users } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { TeamMember } from "@/lib/types";
import { colors } from "@/theme";
import { WS } from "./workspace-ui";

type Props = {
  teamId: string;
  members: TeamMember[];
  bottomInset?: number;
};

function shortName(name: string | null | undefined, email: string) {
  const trimmed = name?.trim();
  if (!trimmed) return email.split("@")[0] || "Member";
  const parts = trimmed.split(/\s+/);
  return parts.length > 1
    ? `${parts[0]} ${parts[parts.length - 1]?.charAt(0)}.`
    : parts[0];
}

export function WorkspaceMembersCarousel({
  teamId,
  members,
  bottomInset = 6,
}: Props) {
  const sorted = [...members].sort((a, b) =>
    (a.user.name?.trim() || a.user.email).localeCompare(
      b.user.name?.trim() || b.user.email,
      undefined,
      { sensitivity: "base" },
    ),
  );

  const openDirectory = () => router.push("/(app)/team");

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(6, bottomInset) }]}
      testID="workspace-members-carousel"
    >
      <View style={styles.header}>
        <Text style={styles.title}>WORKSPACE MEMBERS</Text>
        <Pressable
          onPress={openDirectory}
          style={styles.viewAll}
          accessibilityRole="button"
          accessibilityLabel="View all workspace members"
        >
          <Text style={styles.viewAllText}>View Team</Text>
          <ChevronRight size={14} color={colors.brand} strokeWidth={2.4} />
        </Pressable>
      </View>

      {sorted.length === 0 ? (
        <Pressable onPress={openDirectory} style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Users size={17} color={colors.brand} />
          </View>
          <Text style={styles.emptyText}>No workspace members yet</Text>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {sorted.map((member) => (
            <Pressable
              key={member.userId}
              onPress={() =>
                router.push({
                  pathname: "/member-profile",
                  params: { teamId, memberUserId: member.userId },
                })
              }
              style={styles.member}
              accessibilityRole="button"
              accessibilityLabel={`Open ${member.user.name || "member"} profile`}
            >
              <View style={styles.avatarWrap}>
                <UserAvatar
                  user={member.user}
                  size={36}
                  radius={18}
                  backgroundColor="#EEF2FF"
                  textColor={colors.brand}
                  fontSize={12}
                />
              </View>
              <Text style={styles.memberName} numberOfLines={1}>
                {shortName(member.user.name, member.user.email)}
              </Text>
            </Pressable>
          ))}

          <Pressable
            onPress={openDirectory}
            style={styles.member}
            accessibilityRole="button"
            accessibilityLabel="View all workspace members"
          >
            <View style={styles.moreCircle}>
              <ChevronRight size={16} color={colors.brand} strokeWidth={2.2} />
            </View>
            <Text style={styles.moreText}>View all</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E7EBF1",
    backgroundColor: "#FFFFFF",
  },
  header: {
    minHeight: 18,
    paddingHorizontal: WS.pageGutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.65,
    color: "#7B8799",
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAllText: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    color: colors.brand,
  },
  content: {
    gap: 10,
    paddingHorizontal: WS.pageGutter,
    paddingTop: 6,
    paddingRight: WS.pageGutter + 4,
  },
  member: {
    width: 48,
    alignItems: "center",
  },
  avatarWrap: {
    padding: 2,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#E0E6EF",
    backgroundColor: "#FFFFFF",
  },
  memberName: {
    width: 54,
    marginTop: 3,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
    textAlign: "center",
    color: "#526075",
  },
  moreCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#B9C7F5",
    backgroundColor: "#FAFBFF",
  },
  moreText: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    color: colors.brand,
  },
  empty: {
    minHeight: 54,
    marginTop: 8,
    marginHorizontal: WS.pageGutter,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  emptyText: {
    fontSize: 11,
    color: "#8794A8",
  },
});
