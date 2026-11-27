import { Image, StyleSheet, Text, View } from "react-native";

/**
 * Compact mark for in-app headers.
 * `wordmark` adds white “Alenio”; `title` adds a divider + page name (My Network).
 */
export function AlenioHeaderBrand({
  wordmark = false,
  title,
}: {
  tone?: "light" | "dark";
  wordmark?: boolean;
  /** Page name after a light divider — keeps the icon locked in place. */
  title?: string;
} = {}) {
  const showWordmark = wordmark;
  const pageTitle = title?.trim() || "";

  return (
    <View
      pointerEvents="none"
      accessibilityLabel={pageTitle ? `Alenio, ${pageTitle}` : "Alenio"}
      style={styles.container}
    >
      <View style={styles.iconFrame}>
        <Image
          source={require("@/assets/alenio-icon.png")}
          style={styles.icon}
          resizeMode="contain"
        />
      </View>
      {showWordmark ? <Text style={styles.wordmark}>Alenio</Text> : null}
      {pageTitle ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.pageTitle} numberOfLines={1}>
            {pageTitle}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 30,
    gap: 7,
  },
  iconFrame: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 30,
    height: 30,
  },
  wordmark: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: "#FFFFFF",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 3,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  pageTitle: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: "#FFFFFF",
  },
});
