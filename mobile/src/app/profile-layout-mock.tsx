import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ArrowLeft,
  Building2,
  Globe2,
  Heart,
  MapPin,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Share2,
  UserPlus,
  Users,
} from "lucide-react-native";
import { AlenioDefaultProfileHeader } from "@/components/profile/AlenioDefaultProfileHeader";
import { profileHeaderCurveDepth } from "@/components/profile/ProfileHeaderCurve";

const BRAND = "#4361EE";
const AVATAR = require("@/assets/jasmyn-carter-avatar.jpg");
const ALENIO = require("@/assets/alenio-icon.png");
const BANNER_HEIGHT = 168;

type ActivityTab = "all" | "public" | "connections";

const POSTS = [
  {
    id: "1",
    audience: "public" as const,
    when: "2d ago",
    body: "Great week with the team! Proud of the execution and the focus on guest experience. 👏",
    likes: 24,
    comments: 6,
  },
  {
    id: "2",
    audience: "connections" as const,
    when: "5d ago",
    body: "Orlando ops huddle was excellent today — clarity on priorities makes everything smoother.",
    likes: 11,
    comments: 2,
  },
];

/**
 * Visual mock of the redesigned Member Profile.
 * Open via /profile-layout-mock — not wired into live person data.
 */
export default function ProfileLayoutMockScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<ActivityTab>("public");
  const posts = POSTS.filter((post) =>
    tab === "all" ? true : post.audience === tab,
  );
  const bannerHeight = BANNER_HEIGHT + insets.top;
  const curveDepth = profileHeaderCurveDepth(width);

  return (
    <View style={styles.screen} testID="profile-layout-mock">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      >
        <View
          style={[
            styles.bannerWrap,
            { marginBottom: 52 - curveDepth / 2 },
          ]}
        >
          <AlenioDefaultProfileHeader height={bannerHeight} width={width} />
          <View
            pointerEvents="box-none"
            style={[styles.navOverlay, { paddingTop: insets.top + 8 }]}
          >
            <View style={styles.nav}>
              <Pressable
                onPress={() => router.back()}
                style={styles.navBtn}
                accessibilityRole="button"
                accessibilityLabel="Back"
                testID="profile-layout-mock-back"
              >
                <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.3} />
              </Pressable>
              <Text style={styles.navTitle}>Member Profile</Text>
              <Pressable style={styles.navBtn} accessibilityRole="button">
                <MoreHorizontal size={20} color="#FFFFFF" strokeWidth={2.3} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.avatarWrap, { bottom: curveDepth - 58 }]}>
            <Image source={AVATAR} style={styles.avatar} />
            <View style={styles.avatarBadge}>
              <Image source={ALENIO} style={styles.avatarBadgeIcon} />
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.name}>Jasmyn Carter</Text>
          <Text style={styles.role}>Operations Manager</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Building2 size={13} color={BRAND} strokeWidth={2.2} />
              <Text style={styles.metaText}>Wawa</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaChip}>
              <MapPin size={13} color={BRAND} strokeWidth={2.2} />
              <Text style={styles.metaText}>Orlando, FL</Text>
            </View>
          </View>

          <View style={styles.statsCard}>
            <View style={styles.stat}>
              <Users size={15} color={BRAND} strokeWidth={2.2} />
              <Text style={styles.statValue}>128</Text>
              <Text style={styles.statLabel}>Connections</Text>
            </View>
            <View style={styles.statRule} />
            <View style={styles.stat}>
              <Users size={15} color={BRAND} strokeWidth={2.2} />
              <Text style={styles.statValue}>5</Text>
              <Text style={styles.statLabel}>Mutual</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, styles.actionPrimary]}>
              <UserPlus size={16} color="#FFFFFF" strokeWidth={2.3} />
              <Text style={styles.actionPrimaryText}>Connect</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.actionSecondary]}>
              <MessageSquare size={16} color={BRAND} strokeWidth={2.3} />
              <Text style={styles.actionSecondaryText}>Message</Text>
            </Pressable>
          </View>

          <View style={styles.tabs}>
            {(
              [
                ["all", "All"],
                ["public", "Public"],
                ["connections", "Connections"],
              ] as const
            ).map(([key, label]) => {
              const selected = tab === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={[styles.tab, selected ? styles.tabSelected : null]}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      selected ? styles.tabLabelSelected : null,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.feed}>
            {posts.map((post) => (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Image source={AVATAR} style={styles.postAvatar} />
                  <View style={styles.postMeta}>
                    <Text style={styles.postName}>Jasmyn Carter</Text>
                    <View style={styles.postSub}>
                      <Text style={styles.postWhen}>{post.when}</Text>
                      <Text style={styles.postDot}>·</Text>
                      {post.audience === "public" ? (
                        <Globe2 size={11} color="#98A2B3" strokeWidth={2.2} />
                      ) : (
                        <Users size={11} color="#98A2B3" strokeWidth={2.2} />
                      )}
                      <Text style={styles.postAudience}>
                        {post.audience === "public" ? "Public" : "Connections"}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.postBody}>{post.body}</Text>
                <View style={styles.postEngage}>
                  <View style={styles.engageItem}>
                    <Heart size={14} color="#667085" strokeWidth={2.1} />
                    <Text style={styles.engageCount}>{post.likes}</Text>
                  </View>
                  <View style={styles.engageItem}>
                    <MessageCircle size={14} color="#667085" strokeWidth={2.1} />
                    <Text style={styles.engageCount}>{post.comments}</Text>
                  </View>
                  <Share2 size={14} color="#667085" strokeWidth={2.1} />
                </View>
              </View>
            ))}
            {posts.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No posts in this filter.</Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const elevationSoft = {
  shadowColor: "#1E1B4B",
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  bannerWrap: { marginBottom: 52 },
  navOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 14,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  avatarWrap: {
    position: "absolute",
    alignSelf: "center",
    width: 104,
    height: 104,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  avatarBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BRAND,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadgeIcon: { width: 14, height: 14, tintColor: "#FFFFFF" },
  body: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  name: {
    marginTop: 8,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#111A2B",
    textAlign: "center",
  },
  role: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: "#667085",
    textAlign: "center",
  },
  metaRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 13, fontWeight: "600", color: "#344054" },
  metaDivider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    backgroundColor: "#D0D5DD",
  },
  statsCard: {
    marginTop: 14,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E4F6",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    ...elevationSoft,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#E8E4F6",
  },
  statValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "800",
    color: "#111A2B",
  },
  statLabel: { fontSize: 11, fontWeight: "600", color: "#667085" },
  actions: {
    marginTop: 12,
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionPrimary: { backgroundColor: BRAND },
  actionPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#DDD6FE",
  },
  actionSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: BRAND,
  },
  tabs: {
    marginTop: 18,
    width: "100%",
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E4F0",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabSelected: { borderBottomColor: BRAND },
  tabLabel: { fontSize: 13, fontWeight: "600", color: "#667085" },
  tabLabelSelected: { color: BRAND, fontWeight: "800" },
  sectionTitle: {
    marginTop: 16,
    alignSelf: "flex-start",
    fontSize: 15,
    fontWeight: "800",
    color: "#111A2B",
    letterSpacing: -0.2,
  },
  feed: { marginTop: 10, width: "100%", gap: 10 },
  postCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E4F6",
    backgroundColor: "#FFFFFF",
    padding: 12,
    ...elevationSoft,
  },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  postAvatar: { width: 36, height: 36, borderRadius: 18 },
  postMeta: { flex: 1, minWidth: 0 },
  postName: { fontSize: 13, fontWeight: "700", color: "#111A2B" },
  postSub: { marginTop: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  postWhen: { fontSize: 11, color: "#98A2B3" },
  postDot: { fontSize: 11, color: "#98A2B3" },
  postAudience: { fontSize: 11, color: "#98A2B3", fontWeight: "600" },
  postBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#1F2937",
  },
  postEngage: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  engageItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  engageCount: { fontSize: 12, fontWeight: "600", color: "#667085" },
  empty: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F8F7FC",
  },
  emptyText: { fontSize: 13, color: "#667085", textAlign: "center" },
});
