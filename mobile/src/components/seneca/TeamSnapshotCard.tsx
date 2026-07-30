import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Clock3, Users } from "lucide-react-native";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";
import { UserAvatar } from "@/components/UserAvatar";
import type { SenecaFocusResponse } from "@/lib/seneca-focus";
import {
  senecaFocusPresentationState,
  senecaFocusStateLabel,
} from "@/lib/seneca-focus-presentation";

type Member = {
  name?: string | null;
  image?: string | null;
};

type Props = {
  focus?: SenecaFocusResponse;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  affectedMembers: Member[];
  onOpenFocus: () => void;
};

export function TeamSnapshotCard({
  focus,
  isLoading,
  isError,
  isFetching,
  affectedMembers,
  onOpenFocus,
}: Props) {
  const state = focus ? senecaFocusPresentationState(focus) : null;
  const stateLabel = state ? senecaFocusStateLabel(state) : null;
  const badgeLabel = isFetching ? "Refreshing" : stateLabel;
  const summary = focus?.brief.summary?.trim();
  const firstSentenceEnd = summary?.indexOf(".") ?? -1;
  const headline =
    (summary && firstSentenceEnd > 0
      ? summary.slice(0, firstSentenceEnd)
      : summary) ??
    (isError
      ? "Seneca couldn't update today's recommendation."
      : "Seneca is preparing today's recommendation.");
  const remainder =
    summary && firstSentenceEnd > 0
      ? summary.slice(firstSentenceEnd + 1).trim()
      : null;
  const detail =
    remainder ||
    focus?.brief.rationale ||
    (isError
      ? "Pull to refresh and try again."
      : "Your data-backed coaching focus will appear here.");
  const affectedCount = focus?.brief.affectedCount ?? 0;

  return (
    <View
      style={styles.card}
      testID="team-snapshot-card"
      collapsable={false}
    >
      <Pressable
        onPress={onOpenFocus}
        style={({ pressed }) => [
          styles.inner,
          pressed ? styles.pressedSoft : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Open today's focus brief"
      >
        <View style={styles.focusHeader}>
          <SenecaIcon size={17} />
          <View style={styles.focusHeadingCopy}>
            <View style={styles.titleRow}>
              <Text style={styles.focusTitle} numberOfLines={1}>
                Today{"'"}s Focus
              </Text>
              {badgeLabel ? (
                <View style={styles.statePill}>
                  <Text style={styles.statePillText} numberOfLines={1}>
                    {badgeLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {isLoading && !focus ? (
          <View style={styles.skeletonWrap}>
            <View style={[styles.skeleton, { width: "72%" }]} />
            <View style={[styles.skeleton, { width: "92%" }]} />
          </View>
        ) : (
          <>
            <View style={styles.headlineRow}>
              <Text style={styles.headline} numberOfLines={1}>
                {headline}
              </Text>
              <ChevronRight size={18} color="#6D4AFF" strokeWidth={2.5} />
            </View>
            <Text style={styles.detail} numberOfLines={1}>
              {detail}
            </Text>
          </>
        )}

        <View style={styles.focusMeta}>
          {affectedMembers.length > 0 ? (
            <View style={styles.avatarStack}>
              {affectedMembers.slice(0, 3).map((member, index) => (
                <View
                  key={`${member.name ?? "member"}-${index}`}
                  style={[styles.avatar, index > 0 ? styles.avatarOverlap : null]}
                >
                  <UserAvatar
                    user={member}
                    size={20}
                    radius={10}
                    backgroundColor={index % 2 === 0 ? "#EDE9FE" : "#DBEAFE"}
                    textColor="#6D28D9"
                    fontSize={8}
                  />
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.metaItem}>
            <Users size={12} color="#64748B" />
            <Text style={styles.metaText}>
              {affectedCount} member{affectedCount === 1 ? "" : "s"}
            </Text>
          </View>
          {focus ? (
            <View style={styles.metaItem}>
              <Clock3 size={12} color="#64748B" />
              <Text style={styles.metaText}>
                {focus.brief.estimatedMinutes} min
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
  },
  inner: {
    backgroundColor: "#FFFFFF",
  },
  focusHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  focusHeadingCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 8,
    marginRight: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  focusTitle: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: "800",
    color: "#5B50E6",
    marginRight: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statePill: {
    borderRadius: 999,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statePillText: {
    fontSize: 6,
    fontWeight: "800",
    color: "#6D28D9",
  },
  headlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headline: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#172033",
    letterSpacing: -0.25,
  },
  detail: {
    marginTop: 2,
    marginBottom: 12,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: "#64748B",
  },
  skeletonWrap: {
    marginTop: 3,
    marginBottom: 12,
  },
  skeleton: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    marginBottom: 6,
  },
  focusMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  avatar: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  avatarOverlap: {
    marginLeft: -6,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  metaText: {
    marginLeft: 4,
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
  },
  pressedSoft: {
    backgroundColor: "#F8FAFC",
  },
});
