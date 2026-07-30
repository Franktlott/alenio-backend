import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Clock3, Users } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";
import { UserAvatar } from "@/components/UserAvatar";
import type { SenecaFocusResponse } from "@/lib/seneca-focus";
import {
  senecaFocusPresentationState,
  senecaFocusStateLabel,
} from "@/lib/seneca-focus-presentation";

type Props = {
  focus?: SenecaFocusResponse;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  affectedMembers?: Array<{
    name?: string | null;
    image?: string | null;
  }>;
  onPress: () => void;
};

export function SenecaFocusCard({
  focus,
  isLoading,
  isError,
  isFetching,
  affectedMembers = [],
  onPress,
}: Props) {
  if (isLoading && !focus) {
    return (
      <LinearGradient
        colors={["#FFFFFF", "#F6F2FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, styles.loadingCard]}
        testID="seneca-focus-loading"
      >
        <View style={styles.topRow}>
          <View style={styles.skeletonIcon} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.skeletonLine, { width: "72%" }]} />
            <View style={[styles.skeletonLine, { width: "92%" }]} />
            <View style={[styles.skeletonLine, { width: "68%" }]} />
          </View>
        </View>
      </LinearGradient>
    );
  }

  if (isError && !focus) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.cardPressable, pressed ? styles.pressed : null]}
        accessibilityRole="button"
        accessibilityLabel="Today's Focus unavailable. Open full brief."
        testID="seneca-focus-error"
      >
        <LinearGradient
          colors={["#FFFFFF", "#F6F2FF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.headingRow}>
            <SenecaIcon size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Today&apos;s Focus</Text>
              <Text style={styles.from}>From Seneca</Text>
            </View>
            <ChevronRight size={13} color="#A78BFA" />
          </View>
          <Text style={styles.summary} numberOfLines={2}>
            Seneca couldn&apos;t update your brief. Open it to try again.
          </Text>
          <View style={styles.actionButton}>
            <Text style={styles.link}>Try full brief</Text>
            <ChevronRight size={11} color="#7C3AED" />
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  if (!focus) return null;
  const label = senecaFocusStateLabel(senecaFocusPresentationState(focus));
  const affectedLabel =
    focus.brief.affectedCount === 1
      ? "1 member"
      : `${focus.brief.affectedCount} members`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardPressable, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`Today's Focus from Seneca. ${focus.brief.summary}`}
      testID="seneca-focus-card"
    >
      <LinearGradient
        colors={["#FFFFFF", "#F6F2FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.headingRow}>
          <SenecaIcon size={20} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.titleLine}>
              <Text style={styles.title} numberOfLines={1}>Today&apos;s Focus</Text>
              {label ? <Text style={styles.state}>{label}</Text> : null}
            </View>
            <Text style={styles.from}>From Seneca</Text>
          </View>
          <ChevronRight size={13} color="#A78BFA" />
        </View>

        <Text style={styles.summary} numberOfLines={3}>
          {focus.brief.summary}
        </Text>

        <View style={styles.affectedRow}>
          {affectedMembers.length > 0 ? (
            <View style={styles.avatarStack}>
              {affectedMembers.slice(0, 3).map((member, index) => (
                <View
                  key={`${member.name ?? "member"}-${index}`}
                  style={[styles.miniAvatar, index > 0 ? styles.miniAvatarOverlap : null]}
                >
                  <UserAvatar
                    user={member}
                    size={18}
                    radius={9}
                    backgroundColor={index % 2 === 0 ? "#EDE9FE" : "#DBEAFE"}
                    textColor="#6D28D9"
                    fontSize={7}
                  />
                </View>
              ))}
            </View>
          ) : null}
          <Users size={10} color="#7C83A1" />
          <Text style={styles.affectedText}>{affectedLabel}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.meta}>
            <Clock3 size={10} color="#64748B" />
            <Text style={styles.metaText}>Est. {focus.brief.estimatedMinutes} min</Text>
          </View>
          <Text style={styles.impact}>{focus.brief.impact} impact</Text>
        </View>

        <View style={styles.actionButton}>
          <Text style={styles.link}>
            {isFetching ? "Refreshing…" : "View reasoning"}
          </Text>
          <ChevronRight size={11} color="#7C3AED" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 0,
    height: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    paddingHorizontal: 9,
    paddingVertical: 9,
    gap: 5,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardPressable: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  loadingCard: {
    width: "100%",
  },
  pressed: { opacity: 0.82 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { flexShrink: 1, fontSize: 10, fontWeight: "800", color: "#0F172A" },
  from: { marginTop: 1, fontSize: 6, fontWeight: "800", color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.45 },
  state: { fontSize: 6, fontWeight: "800", color: "#6D28D9", backgroundColor: "#EDE9FE", borderRadius: 999, paddingHorizontal: 4, paddingVertical: 2 },
  recalculating: { fontSize: 8, fontWeight: "700", color: "#4361EE" },
  summary: { flexGrow: 1, fontSize: 9, lineHeight: 12, fontWeight: "600", color: "#334155" },
  affectedRow: { minHeight: 19, flexDirection: "row", alignItems: "center", gap: 3 },
  affectedText: { fontSize: 7, fontWeight: "700", color: "#64748B" },
  avatarStack: { flexDirection: "row", alignItems: "center", marginRight: 2 },
  miniAvatar: { borderRadius: 10, borderWidth: 1, borderColor: "#FFFFFF" },
  miniAvatarOverlap: { marginLeft: -5 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  meta: { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText: { fontSize: 7, fontWeight: "600", color: "#64748B" },
  impact: { fontSize: 7, fontWeight: "800", color: "#0F766E", textTransform: "capitalize" },
  actionButton: { height: 24, borderRadius: 7, backgroundColor: "rgba(124, 58, 237, 0.07)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  link: { fontSize: 8, fontWeight: "800", color: "#7C3AED" },
  skeletonIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#E8ECF4" },
  skeletonLine: { height: 8, borderRadius: 999, backgroundColor: "#E8ECF4" },
});
