import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Sparkles } from "lucide-react-native";
import { router } from "expo-router";
import { AppText, Button, buttonInk, PanelHeader, tintInk } from "@/components/ui";
import { fetchHomeDiscoverArticles, type DiscoverArticleSummary } from "@/lib/discover";
import { discoverCardImageSource } from "@/lib/discover-topic-photos";
import { elevation, palette } from "@/theme";

const PURPLE = palette.violet;
const CARD_GAP = 10;
const WIDE_COLUMNS = 3;
/** Phone shows one full card and a peek of the next. */
const PHONE_VISIBLE = 2.15;
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
  const [coverFailed, setCoverFailed] = useState(false);
  const imageSource = discoverCardImageSource(
    article.coverImageUrl,
    article.category,
    { coverFailed },
  );
  /** Lock the frame so portrait topic photos cannot stretch the card. */
  const imageHeight = Math.max(72, Math.round(width / 2));
  return (
    <Pressable
      onPress={() => openArticle(article.slug)}
      style={[styles.card, { width }]}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      testID={`home-discover-${article.slug}`}
    >
      <View style={[styles.imageFrame, { height: imageHeight }]}>
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={() => setCoverFailed(true)}
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.kicker} numberOfLines={1}>
          {article.category ? (
            <>
              <Text style={{ color: labelColor }}>{article.category.name.toUpperCase()}</Text>
              <Text style={styles.dot}>{"  ·  "}</Text>
            </>
          ) : null}
          {article.readingTimeMinutes > 0 ? `${article.readingTimeMinutes} MIN` : "QUICK"}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {article.title}
        </Text>
        {article.excerpt ? (
          <Text style={styles.excerpt} numberOfLines={1}>
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
      <PanelHeader
        title="Explore"
        tint="sky"
        icon={<Sparkles size={16} color={tintInk("sky")} strokeWidth={2.3} />}
        action={
          <Button
            variant="link"
            label="Explore all"
            accessibilityLabel="Explore all articles"
            onPress={() => router.push("/discover")}
            iconRight={<ChevronRight size={14} color={buttonInk("link")} strokeWidth={2.4} />}
          />
        }
      />
      <AppText variant="supporting" style={styles.subtitle}>
        Ideas, perspectives, and tools to help you grow.
      </AppText>
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
    ...elevation.card,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 12,
  },
  scrollerWrap: {
    position: "relative",
    justifyContent: "flex-start",
  },
  scroller: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: CARD_GAP,
  },
  card: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },
  imageFrame: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#EDE9FE",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  copy: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  kicker: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#98A2B3",
  },
  dot: {
    color: "#C4C9D4",
  },
  title: {
    marginTop: 3,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  excerpt: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 15,
    color: "#667085",
  },
});
