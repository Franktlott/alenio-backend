import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Building2, Megaphone, Newspaper, Users } from "lucide-react-native";
import { colors, elevation, palette, space } from "@/theme";

type Props = {
  onFindPeople?: () => void;
};

/** Phase 0/1 shell for the unified personal Feed (workspace + Alenio + network). */
export function PersonalFeedShell({ onFindPeople }: Props) {
  return (
    <View style={styles.wrap} testID="personal-feed-shell">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Newspaper size={22} color={colors.brand} strokeWidth={2.2} />
        </View>
        <Text style={styles.title}>Your Feed</Text>
        <Text style={styles.body}>
          One place for updates from your workspaces, your network, and Alenio.
          Choose who sees each post before you share.
        </Text>

        <View style={styles.sources}>
          <SourceChip Icon={Building2} label="Workspaces" />
          <SourceChip Icon={Users} label="Network" />
          <SourceChip Icon={Megaphone} label="Alenio" />
        </View>

        <Pressable
          onPress={() => router.push("/create-post")}
          style={styles.cta}
          accessibilityRole="button"
          accessibilityLabel="Create a post"
          testID="personal-feed-create-post"
        >
          <Text style={styles.ctaLabel}>Create a post</Text>
        </Pressable>

        {onFindPeople ? (
          <Pressable
            onPress={onFindPeople}
            style={styles.secondaryCta}
            accessibilityRole="button"
            accessibilityLabel="Find people"
            testID="personal-feed-find-people"
          >
            <Text style={styles.secondaryCtaLabel}>Find people</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function SourceChip({
  Icon,
  label,
}: {
  Icon: typeof Building2;
  label: string;
}) {
  return (
    <View style={styles.chip}>
      <Icon size={13} color={palette.violet} strokeWidth={2.2} />
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: space.sm,
  },
  card: {
    ...elevation.card,
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 12,
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  sources: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: palette.lilacSoft,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.violet,
  },
  cta: {
    marginTop: 8,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.brand,
  },
  ctaLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryCta: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  secondaryCtaLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.brand,
  },
});
