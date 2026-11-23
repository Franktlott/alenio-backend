import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, Sparkles } from "lucide-react-native";
import { router } from "expo-router";
import { PanelHeader, tintInk } from "@/components/ui";
import {
  articlesForHome,
  fetchHomeDiscoverArticles,
  type DiscoverArticleSummary,
} from "@/lib/discover";
import { discoverCardImageSource } from "@/lib/discover-topic-photos";
import { elevation, palette } from "@/theme";

const PURPLE = palette.violet;
const THUMB_W = 96;
const THUMB_H = 72;

function openExplore() {
  router.push("/discover");
}

function openArticle(slug: string) {
  router.push({ pathname: "/discover/[slug]", params: { slug } });
}

function readingLabel(minutes: number) {
  return minutes > 0 ? `${minutes} MIN READ` : "QUICK READ";
}

function FeaturedArticle({
  article,
  cardWidth,
}: {
  article: DiscoverArticleSummary;
  cardWidth?: number;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const imageSource = discoverCardImageSource(
    article.coverImageUrl,
    article.category,
    { coverFailed },
  );
  const categoryName = article.category?.name?.trim() ?? "";
  // Section padding + thumb + gap. A real pixel width keeps the title from collapsing.
  const copyWidth =
    cardWidth != null ? Math.max(96, cardWidth - 28 - THUMB_W - 12) : undefined;

  return (
    <Pressable
      onPress={() => openArticle(article.slug)}
      style={({ pressed }) => [styles.articlePress, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      accessibilityHint="Read article"
      testID={`home-discover-${article.slug}`}
    >
      <View style={styles.article}>
        <Image
          source={imageSource}
          style={styles.thumb}
          resizeMode="cover"
          accessible={false}
          accessibilityIgnoresInvertColors
          onError={() => setCoverFailed(true)}
        />
        <View style={[styles.copy, copyWidth != null ? { width: copyWidth } : null]}>
          <Text style={styles.meta} numberOfLines={1}>
            {categoryName ? (
              <Text style={styles.category}>{categoryName.toUpperCase()}</Text>
            ) : null}
            {categoryName ? <Text style={styles.dot}>{"  ·  "}</Text> : null}
            <Text style={styles.reading}>{readingLabel(article.readingTimeMinutes)}</Text>
          </Text>
          <Text style={styles.title} numberOfLines={2}>
            {article.title}
          </Text>
          <Text style={styles.readLabel} numberOfLines={1}>
            Read article ›
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function HomeDiscover({
  width,
  fill = false,
}: {
  width?: number;
  /** Stretch the card to the cell when Home splits the screen evenly. */
  fill?: boolean;
}) {
  const articlesQuery = useQuery({
    queryKey: ["discover", "home"],
    queryFn: fetchHomeDiscoverArticles,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const articles = articlesQuery.data ?? [];
  const featured = articlesForHome(articles, [], 1)[0];

  if (!featured) return null;

  return (
    <View
      style={[
        styles.section,
        width != null
          ? { width, maxWidth: width, alignSelf: fill ? "stretch" : "flex-start" }
          : null,
        fill ? styles.sectionFill : null,
      ]}
      testID="home-discover"
    >
      <Pressable
        onPress={openExplore}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Explore"
        testID="home-discover-open"
      >
        <PanelHeader
          title="Explore"
          subtitle="Ideas worth discovering."
          tint="sky"
          icon={<Sparkles size={16} color={tintInk("sky")} strokeWidth={2.3} />}
          action={<ChevronRight size={18} color="#98A2B3" strokeWidth={2.2} />}
        />
      </Pressable>

      <View style={styles.articleBlock}>
        <FeaturedArticle article={featured} cardWidth={width} />
      </View>

      <Pressable
        onPress={openExplore}
        style={({ pressed }) => [styles.footer, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Browse all articles"
        testID="home-discover-browse-all"
      >
        <Text style={styles.footerLabel} numberOfLines={1}>
          Browse all articles
        </Text>
        <View style={styles.footerIcon}>
          <ExternalLink size={16} color="#111A2B" strokeWidth={2.2} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    ...elevation.card,
    marginTop: 0,
    marginHorizontal: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    alignSelf: "stretch",
    alignItems: "stretch",
    width: "100%",
    maxWidth: "100%",
    flexGrow: 0,
    flexShrink: 0,
  },
  sectionFill: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  header: {
    borderRadius: 12,
  },
  articleBlock: {
    alignSelf: "stretch",
    flexShrink: 0,
    marginTop: 10,
    marginBottom: 10,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.rowDivider,
  },
  pressed: {
    opacity: 0.92,
  },
  articlePress: {
    alignSelf: "stretch",
    width: "100%",
  },
  article: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 14,
    backgroundColor: palette.lilacSoft,
  },
  copy: {
    flexGrow: 1,
    flexShrink: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  meta: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  category: {
    color: PURPLE,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  dot: {
    color: "#C4C9D4",
    fontWeight: "700",
  },
  reading: {
    color: "#98A2B3",
    fontWeight: "700",
  },
  title: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: "#111A2B",
  },
  readLabel: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: PURPLE,
  },
  footer: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 24,
    justifyContent: "center",
  },
  footerLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: "#111A2B",
    marginRight: 28,
  },
  footerIcon: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
});
