import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { ChevronLeft, ChevronRight, FileDown, Sparkles } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DiscoverArticleBody } from "@/components/discover/DiscoverArticleBody";
import { shareDiscoverArticlePdf } from "@/lib/discover-pdf";
import {
  fetchDiscoverArticle,
  fetchDiscoverArticles,
  discoverByline,
  recordDiscoverView,
  type DiscoverArticleSummary,
} from "@/lib/discover";
import { useSenecaSheetStore } from "@/lib/state/seneca-sheet-store";

const PURPLE = "#6D5EF8";
const FURTHER_COPY = "Want to explore how this idea applies to a situation you're facing?";
const WIDE_MIN = 700;

const CATEGORY_COLOR: Record<string, string> = {
  reflection: "#6D5EF8",
  growth: "#0F9D6E",
  leadership: "#4F46E5",
  communication: "#7C3AED",
  connection: "#059669",
  wellbeing: "#DB2777",
  productivity: "#D97706",
};

function categoryColor(slug: string | undefined) {
  return CATEGORY_COLOR[slug ?? ""] ?? PURPLE;
}

/** Stable for this article, so the pair does not jump while the page is open. */
function pickExplore(articles: DiscoverArticleSummary[], slug: string) {
  const pool = articles.filter((item) => item.slug !== slug);
  if (pool.length <= 2) return pool;
  const seed = [...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const score = (value: string) => {
    let hash = seed || 1;
    for (const char of value) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
    return hash;
  };
  return [...pool].sort((a, b) => score(a.id) - score(b.id)).slice(0, 2);
}

function openArticle(slug: string) {
  router.push({ pathname: "/discover/[slug]", params: { slug } });
}

export default function DiscoverArticleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_MIN;
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const openSeneca = useSenecaSheetStore((state) => state.openSheetWithPrompt);
  const query = useQuery({
    queryKey: ["discover", "article", slug],
    queryFn: () => fetchDiscoverArticle(slug ?? ""),
    enabled: Boolean(slug),
  });
  const listQuery = useQuery({
    queryKey: ["discover", "all"],
    queryFn: fetchDiscoverArticles,
  });

  useEffect(() => {
    if (!slug || !query.data) return;
    void recordDiscoverView(slug).catch(() => undefined);
  }, [slug, query.data]);

  const article = query.data;
  const more = useMemo(
    () => pickExplore(listQuery.data ?? [], slug ?? article?.slug ?? ""),
    [listQuery.data, slug, article?.slug],
  );
  const showSeneca = Boolean(article?.senecaEnabled);
  const labelColor = categoryColor(article?.category?.slug);
  const byline = discoverByline(article ?? {});
  const [pdfBusy, setPdfBusy] = useState(false);

  const savePdf = async () => {
    if (!article || pdfBusy) return;
    setPdfBusy(true);
    try {
      await shareDiscoverArticlePdf(article);
    } catch (error) {
      Alert.alert("Couldn't create the PDF", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const sidebar =
    article && (showSeneca || more.length > 0) ? (
      <View style={[styles.sidebar, wide ? styles.sidebarWide : null]}>
        {showSeneca ? (
          <View style={styles.further}>
            <View style={styles.furtherLabel}>
              <Sparkles size={14} color={PURPLE} strokeWidth={2.4} />
              <Text style={styles.furtherTitle}>Take it further</Text>
            </View>
            <Text style={styles.furtherBody}>{FURTHER_COPY}</Text>
            <Pressable
              onPress={() => {
                const prompt = article.senecaPrompt.trim() || FURTHER_COPY;
                const state = navigation.getState();
                const appIndex = state?.routes.findIndex((route) => route.name === "(app)") ?? -1;
                const steps = appIndex >= 0 && state ? state.index - appIndex : 1;
                let opened = false;
                const openOnce = () => {
                  if (opened) return;
                  opened = true;
                  openSeneca(prompt);
                };
                if (steps > 0) {
                  router.dismiss(steps);
                  // Seneca is a full-screen modal. Opening it during the
                  // article's close makes the two motions flash. Start it
                  // as that close finishes.
                  setTimeout(openOnce, 340);
                } else {
                  openOnce();
                }
              }}
              style={styles.furtherButton}
              accessibilityRole="button"
              accessibilityLabel="Reflect with Seneca"
            >
              <Sparkles size={14} color="#FFFFFF" strokeWidth={2.3} />
              <Text style={styles.furtherButtonText}>Reflect with Seneca</Text>
              <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>
            <View pointerEvents="none" style={styles.furtherWave}>
              <Svg width="100%" height="100%" viewBox="0 0 360 56" preserveAspectRatio="none">
                <Path
                  d="M0 30 C48 18 92 38 148 28 C204 18 246 8 304 18 C332 24 350 22 360 20 L360 56 L0 56 Z"
                  fill="#E6DEFF"
                />
                <Path
                  d="M0 40 C64 32 112 46 176 38 C236 30 286 24 332 34 C348 38 356 36 360 36 L360 56 L0 56 Z"
                  fill="#D9CFFF"
                />
              </Svg>
            </View>
          </View>
        ) : null}
        {more.length > 0 ? (
          <View style={styles.explore}>
            <Text style={styles.exploreHeading}>More to explore</Text>
            {more.map((item) => {
              const color = categoryColor(item.category?.slug);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => openArticle(item.slug)}
                  style={styles.exploreRow}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  {item.coverImageUrl ? (
                    <Image source={{ uri: item.coverImageUrl }} style={styles.exploreThumb} resizeMode="cover" />
                  ) : (
                    <View style={styles.exploreThumb} />
                  )}
                  <View style={styles.exploreCopy}>
                    {item.category ? (
                      <Text style={[styles.exploreKicker, { color }]} numberOfLines={1}>
                        {item.category.name.toUpperCase()}
                      </Text>
                    ) : null}
                    <Text style={styles.exploreTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.readingTimeMinutes > 0 ? (
                      <Text style={styles.exploreMeta}>{item.readingTimeMinutes} min read</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={22} color="#111A2B" />
          <Text style={styles.backText}>Discover</Text>
        </Pressable>
        {article ? (
          <Pressable
            onPress={() => void savePdf()}
            disabled={pdfBusy}
            style={styles.pdfButton}
            accessibilityRole="button"
            accessibilityLabel="Download PDF"
            testID="discover-pdf"
          >
            {pdfBusy ? <ActivityIndicator size="small" color={PURPLE} /> : <FileDown size={16} color={PURPLE} strokeWidth={2.3} />}
            <Text style={styles.pdfText}>PDF</Text>
          </Pressable>
        ) : null}
      </View>
      {!article && query.isLoading ? <Text style={styles.note}>Loading…</Text> : null}
      {!article && query.isError ? <Text style={styles.note}>This article is not available.</Text> : null}
      {article ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {article.coverImageUrl ? (
            <Image
              source={{ uri: article.coverImageUrl }}
              style={[styles.cover, wide ? styles.coverWide : null]}
              resizeMode="cover"
              accessibilityLabel={article.coverImageAlt ?? ""}
            />
          ) : null}
          <View style={wide ? styles.columns : null}>
            <View style={wide ? styles.article : null}>
              <View style={styles.metaRow}>
                {article.category ? (
                  <View style={[styles.pill, { backgroundColor: `${labelColor}18` }]}>
                    <Text style={[styles.pillText, { color: labelColor }]}>
                      {article.category.name.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
                {article.readingTimeMinutes > 0 ? (
                  <Text style={styles.readTime}>{article.readingTimeMinutes} min read</Text>
                ) : null}
              </View>
              <Text style={styles.title}>{article.title}</Text>
              {article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}
              <View style={styles.byline} testID="discover-byline">
                {article.authorName?.trim() ? null : (
                  <Image source={require("@/assets/alenio-icon.png")} style={styles.bylineMark} />
                )}
                <Text style={styles.bylineText}>
                  By <Text style={styles.bylineAuthor}>{byline.author}</Text>
                  {byline.when ? `  ·  ${byline.when}` : ""}
                </Text>
              </View>
              <DiscoverArticleBody blocks={article.content?.content ?? []} />
            </View>
            {sidebar}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  pdfButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4DCFD",
    backgroundColor: "#F6F3FF",
  },
  pdfText: { fontSize: 13, fontWeight: "700", color: PURPLE },
  backText: { fontSize: 16, fontWeight: "600", color: "#111A2B" },
  note: { marginTop: 24, fontSize: 15, color: "#667085" },
  cover: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 18,
    backgroundColor: "#EDE9FE",
    marginBottom: 18,
  },
  coverWide: { aspectRatio: 4.8 },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 28 },
  article: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, lineHeight: 14, fontWeight: "800", letterSpacing: 0.5 },
  readTime: { fontSize: 13, lineHeight: 18, color: "#98A2B3", fontWeight: "600" },
  title: { marginTop: 10, fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -0.6, color: "#111A2B" },
  excerpt: { marginTop: 8, marginBottom: 6, fontSize: 17, lineHeight: 24, color: "#667085" },
  byline: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 6, marginBottom: 14 },
  bylineMark: { width: 20, height: 20, borderRadius: 6 },
  bylineText: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: "#667085" },
  bylineAuthor: { fontWeight: "700", color: "#111A2B" },
  sidebar: { marginTop: 22, gap: 22 },
  sidebarWide: { width: 300, marginTop: 0 },
  further: {
    borderRadius: 20,
    backgroundColor: "#F4F0FF",
    padding: 16,
    paddingBottom: 48,
    gap: 10,
    overflow: "hidden",
  },
  furtherWave: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 44,
  },
  furtherLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  furtherTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800", color: "#111A2B" },
  furtherBody: { fontSize: 15, lineHeight: 21, color: "#3F3D56" },
  furtherButton: {
    marginTop: 4,
    height: 42,
    borderRadius: 12,
    backgroundColor: PURPLE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  furtherButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  explore: { gap: 12 },
  exploreHeading: { fontSize: 16, lineHeight: 21, fontWeight: "800", color: "#111A2B" },
  exploreRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  exploreThumb: { width: 84, height: 56, borderRadius: 10, backgroundColor: "#EDE9FE" },
  exploreCopy: { flex: 1, gap: 2 },
  exploreKicker: { fontSize: 10, lineHeight: 13, fontWeight: "800", letterSpacing: 0.5 },
  exploreTitle: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: "#111A2B" },
  exploreMeta: { fontSize: 12, lineHeight: 16, color: "#98A2B3" },
});
