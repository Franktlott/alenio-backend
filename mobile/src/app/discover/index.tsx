import { useEffect, useMemo, useState } from "react";
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Search,
  Sparkles,
  X,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchDiscoverArticles,
  fetchDiscoverCategories,
  type DiscoverArticleSummary,
  type DiscoverCategory,
} from "@/lib/discover";
import { palette } from "@/theme";

const PURPLE = palette.violet;
const HERO_IMAGE = require("@/assets/alenio-welcome-mountain-ridge-v2.jpg");

const CATEGORY_COLOR: Record<string, string> = {
  reflection: "#6D5EF8",
  growth: "#0F9D6E",
  leadership: "#4F46E5",
  communication: "#7C3AED",
  connection: "#059669",
  wellbeing: "#DB2777",
  "well-being": "#DB2777",
  productivity: "#D97706",
  "help-article": "#6366F1",
};

/** Editorial photography topic tiles. Prefer these over article covers. */
const TOPIC_PHOTO: Record<string, number> = {
  reflection: require("@/assets/discover-topics/discover-topic-reflection-editorial.jpg"),
  growth: require("@/assets/discover-topics/discover-topic-growth-editorial.jpg"),
  leadership: require("@/assets/discover-topics/discover-topic-leadership-editorial.jpg"),
  communication: require("@/assets/discover-topics/discover-topic-communication-editorial.jpg"),
  connection: require("@/assets/discover-topics/discover-topic-connection-editorial.jpg"),
  wellbeing: require("@/assets/discover-topics/discover-topic-wellbeing-editorial.jpg"),
  "well-being": require("@/assets/discover-topics/discover-topic-wellbeing-editorial.jpg"),
  productivity: require("@/assets/discover-topics/discover-topic-productivity-editorial.jpg"),
  "help-article": require("@/assets/discover-topics/discover-topic-help-article-editorial.jpg"),
  help: require("@/assets/discover-topics/discover-topic-help-article-editorial.jpg"),
  "help article": require("@/assets/discover-topics/discover-topic-help-article-editorial.jpg"),
  change: require("@/assets/discover-topics/discover-topic-leadership-editorial.jpg"),
  teamwork: require("@/assets/discover-topics/discover-topic-connection-editorial.jpg"),
};

const TOPIC_PHOTO_FALLBACK = require("@/assets/discover-topics/discover-topic-reflection-editorial.jpg");

function topicPhotoSource(category: DiscoverCategory): number {
  const slug = category.slug.trim().toLowerCase();
  const nameKey = category.name.trim().toLowerCase();
  const compact = `${slug} ${nameKey}`.replace(/[^a-z0-9]+/g, " ");
  const direct =
    TOPIC_PHOTO[slug] ??
    TOPIC_PHOTO[nameKey] ??
    TOPIC_PHOTO[nameKey.replace(/\s+/g, "-")];
  if (direct) return direct;
  if (/\bhelp\b/.test(compact)) return TOPIC_PHOTO["help-article"];
  if (/\breflect/.test(compact)) return TOPIC_PHOTO.reflection;
  if (/\bgrowth\b|\blearn/.test(compact)) return TOPIC_PHOTO.growth;
  if (/\blead/.test(compact)) return TOPIC_PHOTO.leadership;
  if (/\bcommunicat|\bmessage/.test(compact)) return TOPIC_PHOTO.communication;
  if (/\bconnect|\bteam/.test(compact)) return TOPIC_PHOTO.connection;
  if (/\bwell.?being|\bwellness|\bhealth/.test(compact)) return TOPIC_PHOTO.wellbeing;
  if (/\bproductiv|\bfocus/.test(compact)) return TOPIC_PHOTO.productivity;
  return TOPIC_PHOTO_FALLBACK;
}

function publishedTime(article: DiscoverArticleSummary): number {
  return article.publishedAt ? Date.parse(article.publishedAt) : 0;
}

function matchesSearch(article: DiscoverArticleSummary, term: string): boolean {
  if (!term) return true;
  const haystack = [
    article.title,
    article.excerpt,
    article.category?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function openArticle(slug: string) {
  router.push({ pathname: "/discover/[slug]", params: { slug } });
}

function ArticleRow({ article }: { article: DiscoverArticleSummary }) {
  const color = CATEGORY_COLOR[article.category?.slug ?? ""] ?? PURPLE;
  return (
    <Pressable
      onPress={() => openArticle(article.slug)}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={article.title}
      testID={`discover-row-${article.slug}`}
    >
      {article.coverImageUrl ? (
        <Image
          source={{ uri: article.coverImageUrl }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.thumb} />
      )}
      <View style={styles.copy}>
        {article.category ? (
          <Text style={[styles.kicker, { color }]}>
            {article.category.name.toUpperCase()}
          </Text>
        ) : null}
        <Text style={styles.title} numberOfLines={2}>
          {article.title}
        </Text>
        {article.excerpt ? (
          <Text style={styles.excerpt} numberOfLines={2}>
            {article.excerpt}
          </Text>
        ) : null}
        {article.readingTimeMinutes > 0 ? (
          <View style={styles.metaRow}>
            <Clock3 size={12} color="#8B95A5" strokeWidth={2.2} />
            <Text style={styles.meta}>
              {article.readingTimeMinutes} min read
            </Text>
          </View>
        ) : null}
      </View>
      <ChevronRight size={16} color="#C4B5FD" />
    </Pressable>
  );
}

function FeaturedPlaceholder({ topicName }: { topicName?: string }) {
  return (
    <View
      style={styles.featuredBlock}
      testID="discover-featured-placeholder"
      accessibilityLabel="Featured article coming soon"
    >
      <View style={[styles.featured, styles.featuredPlaceholder]}>
        <LinearGradient
          colors={["#2A2160", "#4F3CC4", "#6D55E7"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.featuredFade}
        >
          <View style={styles.placeholderOrbRow} pointerEvents="none">
            <View style={styles.placeholderOrbOne} />
            <View style={styles.placeholderOrbTwo} />
          </View>
          <View style={styles.placeholderMark}>
            <Sparkles size={22} color="#FFFFFF" strokeWidth={2} />
          </View>
          <Text style={styles.featuredKicker}>
            {topicName
              ? `FEATURED · ${topicName.toUpperCase()}`
              : "FEATURED"}
          </Text>
          <Text style={styles.featuredTitle}>
            Featured article coming soon
          </Text>
          <Text style={styles.featuredExcerpt}>
            {topicName
              ? `A premium pick for ${topicName} is on the way. Browse the latest articles below.`
              : "A premium Explore highlight is on the way. Browse the latest articles below."}
          </Text>
          <View style={styles.featuredFooter}>
            <View style={styles.comingSoonChip}>
              <Text style={styles.comingSoonText}>Coming soon</Text>
            </View>
          </View>
        </LinearGradient>
      </View>
      <View style={styles.featuredDots} accessibilityElementsHidden />
    </View>
  );
}

function FeaturedCarousel({
  articles,
  topicName,
  showPlaceholder,
}: {
  articles: DiscoverArticleSummary[];
  topicName?: string;
  showPlaceholder?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const count = articles.length;

  useEffect(() => {
    setIndex(0);
  }, [articles]);

  if (count === 0) {
    return showPlaceholder ? (
      <FeaturedPlaceholder topicName={topicName} />
    ) : null;
  }
  const article = articles[Math.min(index, count - 1)]!;
  const categoryName = article.category?.name?.toUpperCase();

  const coverSource = article.coverImageUrl
    ? { uri: article.coverImageUrl }
    : undefined;

  return (
    <View style={styles.featuredBlock} testID="discover-featured-carousel">
      <Pressable
        onPress={() => openArticle(article.slug)}
        style={styles.featured}
        accessibilityRole="button"
        accessibilityLabel={`Featured: ${article.title}`}
      >
        <ImageBackground
          source={coverSource}
          style={[
            styles.featuredBg,
            !coverSource ? styles.featuredPhotoBlank : null,
          ]}
          imageStyle={styles.featuredBgImage}
        >
          <LinearGradient
            colors={["rgba(15,12,36,0.05)", "rgba(15,12,36,0.55)", "rgba(15,12,36,0.92)"]}
            locations={[0, 0.45, 1]}
            style={styles.featuredFade}
          >
            <Text style={styles.featuredKicker}>
              {categoryName ? `FEATURED · ${categoryName}` : "FEATURED"}
            </Text>
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {article.title || "Featured article"}
            </Text>
            {article.excerpt ? (
              <Text style={styles.featuredExcerpt} numberOfLines={2}>
                {article.excerpt}
              </Text>
            ) : null}
            <View style={styles.featuredFooter}>
              {article.readingTimeMinutes > 0 ? (
                <View style={styles.featuredMeta}>
                  <Clock3
                    size={13}
                    color="rgba(255,255,255,0.9)"
                    strokeWidth={2.2}
                  />
                  <Text style={styles.featuredMetaText}>
                    {article.readingTimeMinutes} min read
                  </Text>
                </View>
              ) : (
                <View />
              )}
              <View style={styles.featuredCta}>
                <Text style={styles.featuredCtaText}>Read article</Text>
                <ChevronRight size={14} color="#FFFFFF" strokeWidth={2.6} />
              </View>
            </View>
          </LinearGradient>
        </ImageBackground>
      </Pressable>
      <View style={styles.featuredDots}>
        {count > 1
          ? articles.map((item, i) => (
              <Pressable
                key={item.id}
                onPress={() => setIndex(i)}
                style={[styles.dot, i === index && styles.dotActive]}
                accessibilityRole="button"
                accessibilityLabel={`Show featured article ${i + 1}`}
              />
            ))
          : null}
      </View>
    </View>
  );
}

export default function DiscoverIndexScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ topic?: string }>();
  const initialTopic =
    typeof params.topic === "string" ? params.topic : "";
  const [topic, setTopic] = useState(initialTopic);
  const [query, setQuery] = useState("");

  const articlesQuery = useQuery({
    queryKey: ["discover", "all"],
    queryFn: fetchDiscoverArticles,
  });
  const categoriesQuery = useQuery({
    queryKey: ["discover", "categories"],
    queryFn: fetchDiscoverCategories,
  });

  const articles = articlesQuery.data ?? [];
  const term = query.trim();

  const categories = useMemo<DiscoverCategory[]>(() => {
    if (categoriesQuery.data && categoriesQuery.data.length > 0) {
      return [...categoriesQuery.data].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
    }
    const seen = new Map<string, DiscoverCategory>();
    for (const article of articles) {
      if (article.category) seen.set(article.category.id, article.category);
    }
    return [...seen.values()].sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
  }, [categoriesQuery.data, articles]);

  const activeTopic =
    categories.find((category) => category.slug === topic) ?? null;

  const visible = useMemo(() => {
    const sorted = [...articles].sort(
      (a, b) => publishedTime(b) - publishedTime(a),
    );
    return sorted.filter((article) => {
      if (topic && article.category?.slug !== topic) return false;
      return matchesSearch(article, term);
    });
  }, [articles, topic, term]);

  const featuredArticles = useMemo(() => {
    if (term) return [] as DiscoverArticleSummary[];
    if (topic) {
      return articles
        .filter(
          (article) =>
            article.category?.slug === topic && article.featuredInCategory,
        )
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .slice(0, 4);
    }
    const homepage = articles
      .filter((article) => article.isFeatured)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .slice(0, 4);
    return homepage;
  }, [articles, topic, term]);

  const countLabel =
    visible.length === 1 ? "1 article" : `${visible.length} articles`;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        stickyHeaderIndices={[]}
      >
        <ImageBackground
          source={HERO_IMAGE}
          style={[styles.hero, { paddingTop: insets.top + 4 }]}
          imageStyle={styles.heroImage}
        >
          <LinearGradient
            colors={[
              "rgba(251,250,255,0.94)",
              "rgba(251,250,255,0.82)",
              "rgba(251,250,255,0.55)",
            ]}
            locations={[0, 0.55, 1]}
            style={styles.heroFade}
            pointerEvents="none"
          />
          <View style={styles.heroContent}>
            <Pressable
              onPress={() => router.back()}
              style={styles.back}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ChevronLeft size={22} color="#111A2B" />
              <Text style={styles.backText}>Home</Text>
            </Pressable>

            <Text style={styles.heading}>
              {activeTopic?.name ?? "Explore"}
            </Text>
            <Text style={styles.subtitle}>
              {term
                ? `${visible.length} ${visible.length === 1 ? "result" : "results"} for “${term}”`
                : activeTopic?.description?.trim() ||
                  "Ideas, perspectives, and tools to help you grow."}
            </Text>

            <View style={styles.filterRow}>
              <View style={styles.searchField}>
                <Search size={16} color="#8B95A5" strokeWidth={2.2} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search articles, topics, or insights…"
                  placeholderTextColor="#98A2B3"
                  style={styles.searchInput}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                  autoCapitalize="none"
                  testID="discover-search"
                />
                {query.length > 0 ? (
                  <Pressable
                    onPress={() => setQuery("")}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <X size={16} color="#8B95A5" strokeWidth={2.2} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </ImageBackground>

        <View style={styles.body}>
          {!term ? (
            <FeaturedCarousel
              articles={featuredArticles}
              topicName={activeTopic?.name}
              showPlaceholder={!!activeTopic}
            />
          ) : null}

          {categories.length > 0 && !term ? (
            <View style={styles.topicsSection}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Explore topics</Text>
                <Pressable
                  onPress={() => {
                    setTopic("");
                    setQuery("");
                  }}
                  disabled={!activeTopic}
                  accessibilityRole="button"
                  accessibilityLabel="Remove all filters"
                  accessibilityState={{ disabled: !activeTopic }}
                  testID="discover-remove-all-filters"
                  style={!activeTopic ? styles.sectionLinkHidden : undefined}
                  hitSlop={8}
                >
                  <Text style={styles.sectionLink}>Remove all filters</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                nestedScrollEnabled
                directionalLockEnabled
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                style={styles.topicTilesScroll}
                contentContainerStyle={styles.topicTiles}
              >
                {categories.map((category) => {
                  const active = category.slug === topic;
                  const photo = topicPhotoSource(category);
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() =>
                        setTopic(active ? "" : category.slug)
                      }
                      style={[
                        styles.topicTile,
                        active && styles.topicTileActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      testID={`discover-topic-tile-${category.slug}`}
                    >
                      <Image
                        key={`topic-photo-${category.slug}-editorial`}
                        source={photo}
                        style={styles.topicTilePhoto}
                        resizeMode="cover"
                      />
                      <LinearGradient
                        colors={[
                          "rgba(15,23,42,0)",
                          "rgba(15,23,42,0.18)",
                          "rgba(15,23,42,0.62)",
                        ]}
                        locations={[0.35, 0.68, 1]}
                        style={styles.topicTileFade}
                        pointerEvents="none"
                      />
                      <Text
                        style={styles.topicTileText}
                        numberOfLines={2}
                        allowFontScaling={false}
                      >
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {term
                ? "Search results"
                : activeTopic
                  ? `Latest in ${activeTopic.name}`
                  : "Latest articles"}
            </Text>
            {!articlesQuery.isLoading ? (
              <Text style={styles.listCount}>{countLabel}</Text>
            ) : null}
          </View>

          {articlesQuery.isLoading ? (
            <Text style={styles.note}>Loading articles…</Text>
          ) : null}

          {!articlesQuery.isLoading && visible.length === 0 ? (
            <View style={styles.empty} testID="discover-empty">
              <Sparkles size={22} color={PURPLE} strokeWidth={2} />
              <Text style={styles.emptyTitle}>
                {term
                  ? "No matching articles"
                  : activeTopic
                    ? `No articles in ${activeTopic.name} yet`
                    : "No published articles yet"}
              </Text>
              {term || activeTopic ? (
                <Pressable
                  onPress={() => {
                    setQuery("");
                    setTopic("");
                  }}
                  style={styles.emptyAction}
                  accessibilityRole="button"
                >
                  <Text style={styles.emptyActionText}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {visible.map((article) => (
            <ArticleRow key={article.id} article={article} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FBFAFF",
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    overflow: "hidden",
    position: "relative",
  },
  heroImage: {
    resizeMode: "cover",
  },
  heroFade: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  heroContent: {
    position: "relative",
    zIndex: 1,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    alignSelf: "flex-start",
  },
  backText: { fontSize: 15, fontWeight: "600", color: "#111A2B" },
  heading: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "800",
    color: "#111A2B",
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    maxWidth: 320,
    fontSize: 13,
    lineHeight: 18,
    color: "#4B5565",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchField: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#111A2B",
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  featuredBlock: {
    marginBottom: 12,
  },
  featured: {
    height: 180,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#1B1736",
  },
  featuredBg: {
    flex: 1,
    justifyContent: "flex-end",
  },
  featuredBgImage: {
    resizeMode: "cover",
  },
  featuredPhotoBlank: {
    backgroundColor: "#2B2566",
  },
  featuredPlaceholder: {
    backgroundColor: "#2A2160",
  },
  featuredFade: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 36,
    paddingBottom: 14,
    justifyContent: "flex-end",
  },
  placeholderOrbRow: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholderOrbOne: {
    position: "absolute",
    right: -20,
    top: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  placeholderOrbTwo: {
    position: "absolute",
    right: 48,
    bottom: 24,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(242,184,75,0.18)",
  },
  placeholderMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    marginBottom: 12,
  },
  comingSoonChip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  comingSoonText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  featuredKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#C4B5FD",
  },
  featuredTitle: {
    marginTop: 4,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  featuredExcerpt: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.9)",
  },
  featuredFooter: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  featuredMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  featuredMetaText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },
  featuredCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: PURPLE,
  },
  featuredCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  featuredDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    height: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#DDD8F5",
  },
  dotActive: {
    backgroundColor: PURPLE,
  },
  topicsSection: {
    marginBottom: 12,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111A2B",
    letterSpacing: -0.2,
  },
  sectionLink: {
    fontSize: 12,
    fontWeight: "700",
    color: PURPLE,
  },
  sectionLinkHidden: {
    opacity: 0,
  },
  topicTilesScroll: {
    marginHorizontal: -16,
  },
  topicTiles: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    paddingHorizontal: 16,
    paddingRight: 20,
    paddingVertical: 1,
  },
  topicTile: {
    width: 108,
    height: 132,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(17,26,43,0.10)",
    backgroundColor: "#E8E4F4",
    position: "relative",
  },
  topicTileActive: {
    borderColor: PURPLE,
  },
  topicTilePhoto: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  topicTileFade: {
    ...StyleSheet.absoluteFillObject,
  },
  topicTileText: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    zIndex: 2,
    height: 28,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.25,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  listCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B95A5",
  },
  note: { marginTop: 12, fontSize: 15, color: "#667085" },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111A2B",
    textAlign: "center",
  },
  emptyAction: { marginTop: 4, paddingVertical: 6, paddingHorizontal: 8 },
  emptyActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: PURPLE,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EDE9FE",
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: "#EDE9FE",
  },
  copy: { flex: 1, gap: 3, paddingTop: 1 },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  title: { fontSize: 16, fontWeight: "800", color: "#111A2B" },
  excerpt: {
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  meta: { fontSize: 12, color: "#8B95A5", fontWeight: "600" },
});
