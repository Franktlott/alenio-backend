import { Pressable, Text, View, StyleSheet } from "react-native";
import { ChevronRight, Star } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { memberStarPath, memberStars } from "@/lib/team-momentum";
import type { TeamMomentumMemberSummary } from "@/lib/team-momentum";
import { STARS_GOLD, STARS_PURPLE, starsJourneyTitle } from "@/lib/stars";

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
        const nextTitle = starsJourneyTitle(path.nextMilestone);
        const progressRatio =
          path.segmentSize > 0 ? path.filledInSegment / path.segmentSize : 0;

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
            <View
              style={[
                styles.avatarWrap,
                needsNudge ? styles.avatarWrapNudge : null,
              ]}
            >
              <UserAvatar
                user={{
                  name: member.name,
                  email: member.email,
                  image: member.image,
                }}
                size={40}
                radius={12}
                backgroundColor={needsNudge ? "#EEF2FF" : "#F5F3FF"}
                textColor="#4338CA"
                fontSize={13}
              />
            </View>

            <View style={styles.copy}>
              <View style={styles.titleRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {member.name}
                </Text>
                {needsNudge ? (
                  <View style={styles.nudgeBadge}>
                    <Text style={styles.nudgeBadgeText}>Nudge</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.sub} numberOfLines={1}>
                {needsNudge
                  ? "0 stars · get started"
                  : `${path.remainingToMilestone} more to ${nextTitle}`}
              </Text>
              {!needsNudge ? (
                <View style={styles.progressBlock}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(8, Math.min(100, progressRatio * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressLabel}>
                    {stars} / {path.nextMilestone}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.trailing}>
              <View style={styles.starMeta}>
                <Star
                  size={15}
                  color={STARS_GOLD}
                  fill={STARS_GOLD}
                  strokeWidth={0}
                />
                <Text style={styles.starCount}>{stars}</Text>
              </View>
              {openable ? (
                <ChevronRight size={20} color="#94A3B8" strokeWidth={2.2} />
              ) : null}
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
  list: { gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  rowNudge: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F3FF",
  },
  avatarWrapNudge: {
    backgroundColor: "#EEF2FF",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  nudgeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#EDE9FE",
  },
  nudgeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: STARS_PURPLE,
  },
  sub: {
    fontSize: 13,
    lineHeight: 17,
    color: "#64748B",
  },
  progressBlock: {
    marginTop: 6,
    gap: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E9E5FF",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: STARS_PURPLE,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: STARS_PURPLE,
  },
  trailing: {
    alignItems: "center",
    gap: 8,
  },
  starMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  starCount: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: "#94A3B8",
    textAlign: "center",
  },
  empty: {
    padding: 20,
    borderRadius: 16,
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
