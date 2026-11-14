import type { ImageSourcePropType } from "react-native";
import type { DiscoverCategory } from "@/lib/discover";

/** Editorial photography topic tiles for Explore cards. */
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

/** Local topic photo for a Discover/Explore category. */
export function discoverTopicPhotoSource(
  category?: DiscoverCategory | null,
): number {
  if (!category) return TOPIC_PHOTO_FALLBACK;
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

/**
 * Prefer a saved cover URL; fall back to the category topic photo so Explore
 * cards never show an empty purple block when a cover is missing or broken.
 */
export function discoverCardImageSource(
  coverImageUrl: string | null | undefined,
  category?: DiscoverCategory | null,
  options?: { preferTopic?: boolean; coverFailed?: boolean },
): ImageSourcePropType {
  const topic = discoverTopicPhotoSource(category);
  if (options?.preferTopic) return topic;
  const url = coverImageUrl?.trim();
  if (url && !options?.coverFailed) return { uri: url };
  return topic;
}
