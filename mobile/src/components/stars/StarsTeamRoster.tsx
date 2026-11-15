import { Pressable, Text, View, StyleSheet } from "react-native";
import { Star } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { memberStarPath, memberStars } from "@/lib/team-momentum";
import type { TeamMomentumMemberSummary } from "@/lib/team-momentum";
import { STARS_GOLD } from "@/lib/stars";

type Props = {
  rows: TeamMomentumMemberSummary[];
  coaching?: boolean;
  onOpenMember: (userId: string) => void;
  canOpenMember?: (userId: string) => boolean;
};

export function StarsTeamRoster({
  rows,
  coaching = true,
  onOpenMember,
  canOpenMember,
}: Props) {
  if (rows.length === 0) {
    return (
      <View style={styles.empty} testID="stars-team-empty">
        <Text style={styles.emptyTitle}>No team members yet</Text>
        <Text style={styles.emptyBody}>
          Invite people to this workspace to track their stars.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list} testID="stars-team-roster">
      {rows.map((member) => {
        const stars = memberStars(member);
        const path = memberStarPath(member);
        const needsNudge = member.needsNudge ?? stars === 0;
        const openable = canOpenMember?.(member.userId) ?? true;
        return (
          <Pressable
            key={member.userId}
            onPress={() => openable && onOpenMember(member.userId)}
            disabled={!openable}
            style={[styles.row, needsNudge ? styles.rowNudge : null]}
            accessibilityRole="button"
            accessibilityLabel={`${member.name}, ${stars} stars`}
            testID={`stars-team-row-${member.userId}`}
          >
            <UserAvatar
              user={{
                name: member.name,
                email: member.email,
                image: member.image,
              }}
              size={36}
              radius={18}
              backgroundColor="#F1F5F9"
              textColor="#334155"
              fontSize={12}
            />
            <View style={styles.meta}>
              <Text style={styles.name} numberOfLines={1}>
                {member.name}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {needsNudge
                  ? "0 stars · get started"
                  : `${path.remainingToMilestone} to milestone`}
              </Text>
            </View>
            <View style={styles.chip}>
              <Star size={14} color={STARS_GOLD} fill={STARS_GOLD} strokeWidth={0} />
              <Text style={styles.chipText}>{stars}</Text>
            </View>
          </Pressable>
        );
      })}
      {coaching ? (
        <Text style={styles.hint}>
          Sorted so people who need a nudge show up first.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  rowNudge: {
    borderColor: "#F6E7C1",
    backgroundColor: "#FFFBF2",
  },
  meta: { flex: 1, minWidth: 0, gap: 2 },
  name: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  sub: {
    fontSize: 12,
    color: "#64748B",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FFF8E7",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#92400E",
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
  },
  empty: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
});
