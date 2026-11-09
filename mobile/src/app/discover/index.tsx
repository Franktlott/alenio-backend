import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchDiscoverArticles, type DiscoverArticleSummary } from "@/lib/discover";

const PURPLE = "#6D5EF8";

function ArticleRow({ article }: { article: DiscoverArticleSummary }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/discover/[slug]", params: { slug: article.slug } })}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={article.title}
    >
      {article.coverImageUrl ? (
        <Image source={{ uri: article.coverImageUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={styles.thumb} />
      )}
      <View style={styles.copy}>
        {article.category ? <Text style={styles.kicker}>{article.category.name.toUpperCase()}</Text> : null}
        <Text style={styles.title}>{article.title}</Text>
        {article.readingTimeMinutes > 0 ? (
          <Text style={styles.meta}>{article.readingTimeMinutes} min read</Text>
        ) : null}
      </View>
      <ChevronRight size={16} color="#C4B5FD" />
    </Pressable>
  );
}

export default function DiscoverIndexScreen() {
  const insets = useSafeAreaInsets();
  const query = useQuery({
    queryKey: ["discover", "all"],
    queryFn: fetchDiscoverArticles,
  });
  const articles = query.data ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <ChevronLeft size={22} color="#111A2B" />
        <Text style={styles.backText}>Home</Text>
      </Pressable>
      <Text style={styles.heading}>Discover</Text>
      <Text style={styles.subtitle}>Ideas, perspectives, and tools to help you grow.</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {query.isLoading ? <Text style={styles.note}>Loading articles…</Text> : null}
        {!query.isLoading && articles.length === 0 ? (
          <Text style={styles.note}>No published articles yet.</Text>
        ) : null}
        {articles.map((article) => (
          <ArticleRow key={article.id} article={article} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FBFAFF", paddingHorizontal: 16 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  backText: { fontSize: 16, fontWeight: "600", color: "#111A2B" },
  heading: { marginTop: 12, fontSize: 28, fontWeight: "800", color: "#111A2B" },
  subtitle: { marginTop: 4, marginBottom: 12, fontSize: 14, color: "#667085" },
  note: { marginTop: 12, fontSize: 15, color: "#667085" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#EDE9FE",
  },
  thumb: { width: 80, height: 45, borderRadius: 10, backgroundColor: "#EDE9FE" },
  copy: { flex: 1, gap: 2 },
  kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, color: PURPLE },
  title: { fontSize: 16, fontWeight: "700", color: "#111A2B" },
  meta: { fontSize: 12, color: "#667085" },
});
