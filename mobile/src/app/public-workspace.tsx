import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ChevronRight,
  MoreHorizontal,
  ShieldCheck,
  Users,
} from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Team, TeamMember } from "@/lib/types";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { UserAvatar } from "@/components/UserAvatar";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";

const BRAND = "#5346E8";
const PAGE = "#FFFFFF";
const PREVIEW_COUNT = 5;

function shortName(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Member";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

export default function PublicWorkspaceScreen() {
  const insets = useSafeAreaInsets();
  const { teamId, teamName } = useLocalSearchParams<{ teamId?: string; teamName?: string }>();
  const { switchWorkspace } = useSwitchWorkspace();
  const [opening, setOpening] = useState(false);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const name = team?.name ?? teamName ?? "Workspace";
  const members = team?.members ?? [];
  const preview = showAllPeople ? members : members.slice(0, PREVIEW_COUNT);
  const about = team?.location?.trim()
    ? team.location.trim()
    : "A place for your team to connect, collaborate, and grow together.";

  const openWorkspace = async () => {
    if (!teamId || opening) return;
    setOpening(true);
    try {
      await switchWorkspace(teamId);
      router.replace("/(app)/execute");
    } finally {
      setOpening(false);
    }
  };

  const openSettings = () => {
    if (!teamId) return;
    router.push({ pathname: "/workspace-settings", params: { teamId } });
  };

  const openPerson = (member: TeamMember) => {
    router.push({ pathname: "/person", params: { userId: member.userId } });
  };

  return (
    <View style={styles.screen} testID="public-workspace-screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color="#111A2B" strokeWidth={2.25} />
        </Pressable>
        <Text style={styles.headerTitle}>Workspace</Text>
        <Pressable
          onPress={openSettings}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Workspace options"
          testID="public-workspace-menu"
        >
          <MoreHorizontal size={20} color="#111A2B" strokeWidth={2.25} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : !team ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Workspace unavailable</Text>
          <Text style={styles.emptyBody}>Only shared workspace information is visible.</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.banner}>
              <Image
                source={require("@/assets/alenio-welcome-mountain-ridge-v2.jpg")}
                style={styles.bannerImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", PAGE]}
                locations={[0, 0.62, 1]}
                style={styles.bannerFade}
                pointerEvents="none"
              />
              <View style={styles.mark}>
                <WorkspaceTeamAvatar
                  team={{ name, image: team.image }}
                  size={64}
                  radius={18}
                  backgroundColor="#EEF2FF"
                  textColor={BRAND}
                  borderColor="#E4E0FF"
                />
              </View>
            </View>

            <Text style={styles.name}>{name}</Text>
            <View style={styles.memberCount}>
              <Users size={14} color="#667085" strokeWidth={2.2} />
              <Text style={styles.memberCountText}>
                {members.length} member{members.length === 1 ? "" : "s"}
              </Text>
            </View>

            <Pressable
              onPress={openSettings}
              style={styles.aboutCard}
              accessibilityRole="button"
              accessibilityLabel="About this workspace"
            >
              <View style={styles.aboutIcon}>
                <Building2 size={16} color={BRAND} strokeWidth={2.2} />
              </View>
              <View style={styles.aboutCopy}>
                <Text style={styles.aboutTitle}>About this workspace</Text>
                <Text style={styles.aboutBody}>{about}</Text>
              </View>
              <ChevronRight size={18} color="#C4B5FD" strokeWidth={2.2} />
            </Pressable>

            <View style={styles.stats}>
              <View style={styles.stat}>
                <Users size={15} color={BRAND} strokeWidth={2.2} />
                <Text style={styles.statText}>
                  {members.length} member{members.length === 1 ? "" : "s"}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <ShieldCheck size={15} color={BRAND} strokeWidth={2.2} />
                <Text style={styles.statText}>Shared workspace</Text>
              </View>
            </View>

            <View style={styles.peopleHeader}>
              <Users size={16} color="#111A2B" strokeWidth={2.2} />
              <Text style={styles.peopleTitle}>People</Text>
              <View style={styles.headerSpacer} />
              {members.length > PREVIEW_COUNT ? (
                <Pressable
                  onPress={() => setShowAllPeople((open) => !open)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`View all ${members.length} people`}
                  testID="public-workspace-people-all"
                >
                  <Text style={styles.viewAll}>
                    {showAllPeople ? "Show less" : `View all ${members.length}`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.peopleRow}>
              {preview.map((member) => (
                <Pressable
                  key={member.userId}
                  onPress={() => openPerson(member)}
                  style={styles.person}
                  accessibilityRole="button"
                  accessibilityLabel={member.user.name ?? "Member"}
                >
                  <UserAvatar
                    user={member.user}
                    size={56}
                    radius={28}
                    backgroundColor="#F3F0FF"
                    textColor={BRAND}
                    fontSize={16}
                  />
                  <Text style={styles.personName} numberOfLines={1}>
                    {shortName(member.user.name)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              onPress={() => void openWorkspace()}
              disabled={opening}
              style={styles.openButton}
              accessibilityRole="button"
              accessibilityLabel="Open workspace"
              testID="public-workspace-open"
            >
              {opening ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <ArrowUpRight size={18} color="#FFFFFF" strokeWidth={2.3} />
                  <Text style={styles.openButtonText}>Open workspace</Text>
                </>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: "#111A2B",
    letterSpacing: -0.3,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#334155" },
  emptyBody: { marginTop: 6, fontSize: 13, lineHeight: 18, color: "#94A3B8", textAlign: "center" },
  content: { paddingHorizontal: 16, paddingBottom: 16 },
  banner: {
    height: 148,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#E7E4F8",
  },
  bannerImage: {
    position: "absolute",
    width: "160%",
    aspectRatio: 16 / 9,
    right: -20,
    bottom: -36,
  },
  bannerFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
  },
  mark: { position: "absolute", left: 16, bottom: 16 },
  name: {
    marginTop: 16,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#111A2B",
  },
  memberCount: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  memberCountText: { fontSize: 14, lineHeight: 18, color: "#667085" },
  aboutCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#F7F5FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  aboutIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFEAFF",
  },
  aboutCopy: { flex: 1, minWidth: 0 },
  aboutTitle: { fontSize: 15, lineHeight: 19, fontWeight: "800", color: "#111A2B" },
  aboutBody: { marginTop: 2, fontSize: 13, lineHeight: 18, color: "#667085" },
  stats: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: "#F7F5FF",
    flexDirection: "row",
    alignItems: "center",
  },
  stat: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: "#E4DFF8" },
  statText: { fontSize: 13, lineHeight: 17, fontWeight: "600", color: "#344054" },
  peopleHeader: {
    marginTop: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  peopleTitle: { fontSize: 16, lineHeight: 20, fontWeight: "800", color: "#111A2B" },
  headerSpacer: { flex: 1 },
  viewAll: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: BRAND },
  peopleRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  person: { width: 64, alignItems: "center", gap: 6 },
  personName: { fontSize: 12, lineHeight: 15, color: "#667085", textAlign: "center" },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: PAGE,
  },
  openButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: BRAND,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  openButtonText: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: "#FFFFFF" },
});
