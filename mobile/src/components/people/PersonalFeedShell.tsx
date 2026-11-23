import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { PenLine } from "lucide-react-native";
import { colors } from "@/theme";

type Props = {
  onFindPeople?: () => void;
};

/**
 * Empty feed intro — one composed block, quiet enterprise tone.
 * Invites writing without marketing chips or a sparse checklist.
 */
export function PersonalFeedShell({ onFindPeople }: Props) {
  return (
    <View style={styles.wrap} testID="personal-feed-shell">
      <View style={styles.card}>
        <View style={styles.mark}>
          <PenLine size={18} color="#475569" strokeWidth={2.1} />
        </View>

        <Text style={styles.title}>Share an update</Text>
        <Text style={styles.body}>
          Post to a workspace, your network, or both. You choose who sees it
          before it goes out.
        </Text>

        <Pressable
          onPress={() => router.push("/create-post")}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel="Create a post"
          testID="personal-feed-create-post"
        >
          <Text style={styles.primaryLabel}>Create a post</Text>
        </Pressable>

        {onFindPeople ? (
          <Pressable
            onPress={onFindPeople}
            hitSlop={8}
            style={styles.link}
            accessibilityRole="button"
            accessibilityLabel="Find people"
            testID="personal-feed-find-people"
          >
            <Text style={styles.linkLabel}>Find people to follow</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingTop: 28,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 28,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8ECF1",
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: colors.textPrimary,
    textAlign: "center",
  },
  body: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
    maxWidth: 300,
  },
  primary: {
    marginTop: 20,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    alignSelf: "stretch",
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  link: {
    marginTop: 14,
    paddingVertical: 4,
  },
  linkLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
});
