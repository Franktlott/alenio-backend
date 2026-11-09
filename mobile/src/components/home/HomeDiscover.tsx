import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Sparkles } from "lucide-react-native";
import { router } from "expo-router";
import { fetchHomeDiscoverArticles, type DiscoverArticleSummary } from "@/lib/discover";

const PURPLE = "#6D5EF8";
const CARD_GAP = 10;
const WIDE_COLUMNS = 3;
/** Phone shows one full card and a peek of the next. */
const PHONE_VISIBLE = 1.7;
/** Wide rows are much wider than a phone, so a third of that row is too large. */
const WIDE_CARD_MAX = 200;

function cardWidthForRow(rowWidth: number, columns: number) {
  if (rowWidth <= 0) return 0;
  return (rowWidth - CARD_GAP * (columns - 1)) / columns;
}

const CATEGORY_COLOR: Record<string, string> = {
  reflection: "#6D5EF8",
  growth: "#0F9D6E",
  leadership: "#4F46E5",
  communication: "#7C3AED",
  connection: "#059669",
  wellbeing: "#DB2777",
  productivity: "#D97706",
};

function openArticle(slug: string) {
  router.push({ pathname: "/discover/[slug]", params: { slug } });
}

function DiscoverCard({
  article,
  width,
}: {
  article: DiscoverArticleSummary;
  width: number;
}) {
  const slug = article.category?.slug ?? "";
  const labelColor = CATEGORY_COLOR[slug] ?? PURPLE;
  return (
    <Pressable
      onPress={() => openArticle(article.slug)}
      style={[styles.card, { width }]}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      testID={`home-discover-${article.slug}`}
    >
      {article.coverImageUrl ? (
        <Image
          source={{ uri: article.coverImageUrl }}
          style={styles.image}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.imageFallback} />
      )}
      <View style={styles.copy}>
        <Text style={styles.kicker} numberOfLines={1}>
          {article.category ? (
            <>
              <Text style={{ color: labelColor }}>{article.category.name.toUpperCase()}</Text>
              <Text style={styles.dot}>{"  ·  "}</Text>
            </>
          ) : null}
          {article.readingTimeMinutes > 0 ? `${article.readingTimeMinutes} MIN READ` : "QUICK READ"}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {article.title}
        </Text>
        {article.excerpt ? (
          <Text style={styles.excerpt} numberOfLines={2}>
            {article.excerpt}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function HomeDiscover({ wide }: { wide: boolean }) {
  const query = useQuery({
    queryKey: ["discover", "home"],
    queryFn: fetchHomeDiscoverArticles,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const articles = query.data ?? [];
  const [rowWidth, setRowWidth] = useState(0);
  if (articles.length === 0) return null;
  const fitted = wide
    ? cardWidthForRow(rowWidth, WIDE_COLUMNS)
    : rowWidth > 0
      ? (rowWidth - CARD_GAP) / PHONE_VISIBLE
      : 0;
  const cardWidth = wide ? Math.min(fitted, WIDE_CARD_MAX) : fitted;
  const cards =
    cardWidth > 0
      ? articles.map((article) => (
          <DiscoverCard key={article.id} article={article} width={cardWidth} />
        ))
      : null;

  return (
    <View style={styles.section} testID="home-discover">
      <View style={styles.header}>
        <Sparkles size={16} color={PURPLE} strokeWidth={2.3} />
        <Text style={styles.heading}>Discover</Text>
        <Pressable
          onPress={() => router.push("/discover")}
          hitSlop={8}
          style={styles.link}
          accessibilityRole="button"
          accessibilityLabel="Explore all Discover articles"
        >
          <Text style={styles.linkText}>Explore all</Text>
          <ChevronRight size={14} color={PURPLE} strokeWidth={2.4} />
        </Pressable>
      </View>
      <Text style={styles.subtitle}>Ideas, perspectives, and tools to help you grow.</Text>
      <View style={styles.scrollerWrap} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
          contentContainerStyle={styles.row}
        >
          {cards}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: "#FBFAFF",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heading: {
    flex: 1,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
    color: "#111A2B",
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  linkText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: PURPLE,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
  },
  scrollerWrap: {
    position: "relative",
    justifyContent: "center",
  },
  scroller: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: CARD_GAP,
  },
  card: {
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#EDE9FE",
  },
  imageFallback: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#EDE9FE",
  },
  copy: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  kicker: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#98A2B3",
  },
  dot: {
    color: "#C4C9D4",
  },
  title: {
    marginTop: 5,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  excerpt: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 17,
    color: "#667085",
  },
});
