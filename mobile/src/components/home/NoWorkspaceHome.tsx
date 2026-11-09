import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronRight,
  MessageCircle,
  Sparkles,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react-native";
import { router } from "expo-router";
import { UserAvatar } from "@/components/UserAvatar";
import type { ConnectionEntry, ConnectionsResponse } from "@/lib/types";

const PURPLE = "#6D5EF8";

type Props = {
  connections: ConnectionsResponse | undefined;
  wide: boolean;
  columnWidth: number;
  insightTitle: string;
  insightBody: string;
  insightAction: string;
  onInsight: () => void;
};

function openNetwork() {
  router.push("/(app)/team");
}

function openPerson(userId: string) {
  router.push({ pathname: "/person", params: { userId } });
}

export function NoWorkspaceHome({
  connections,
  wide,
  columnWidth,
  insightTitle,
  insightBody,
  insightAction,
  onInsight,
}: Props) {
  const accepted = connections?.accepted.length ?? 0;
  const incoming = connections?.incoming ?? [];
  const sent = connections?.outgoing.length ?? 0;
  const networkIsEmpty = accepted === 0 && incoming.length === 0 && sent === 0;
  const stats = [
    { key: "connections", value: accepted, label: "Connections" },
    { key: "requests", value: incoming.length, label: "Requests" },
    { key: "sent", value: sent, label: "Sent" },
  ];

  const networkCard = (
    <View style={[styles.card, wide ? styles.wideCard : null]} testID="home-network-card">
      <View style={styles.cardHeader}>
        <Users size={18} color={PURPLE} strokeWidth={2.2} />
        <Text style={styles.cardTitle}>Your network</Text>
        <Pressable
          onPress={openNetwork}
          hitSlop={8}
          style={styles.cardLink}
          accessibilityRole="button"
          accessibilityLabel="View network"
        >
          <Text style={styles.cardLinkText}>View network</Text>
          <ChevronRight size={14} color={PURPLE} strokeWidth={2.4} />
        </Pressable>
      </View>
      <View style={styles.statRow}>
        {stats.map((stat) => (
          <Pressable
            key={stat.key}
            onPress={openNetwork}
            style={styles.statTile}
            accessibilityRole="button"
            accessibilityLabel={`${stat.value} ${stat.label}`}
          >
            <Text
              style={[
                styles.statValue,
                stat.key === "requests" ? styles.statValueHot : null,
              ]}
            >
              {stat.value}
            </Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </Pressable>
        ))}
      </View>
      {incoming.slice(0, 2).map((entry) => (
        <RequestRow key={entry.id} entry={entry} />
      ))}
      {networkIsEmpty ? (
        <View style={styles.networkEmpty}>
          <Text style={styles.networkEmptyTitle}>Your network starts here</Text>
          <Text style={styles.networkEmptyText}>
            Find someone you already know on Alenio.
          </Text>
          <Pressable
            onPress={openNetwork}
            style={styles.networkEmptyAction}
            accessibilityRole="button"
            accessibilityLabel="Find people"
            testID="home-network-empty-find"
          >
            <UserPlus size={13} color={PURPLE} strokeWidth={2.3} />
            <Text style={styles.networkEmptyActionText}>Find people</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const stayCard = (
    <View style={[styles.card, wide ? styles.wideCard : null]} testID="home-stay-connected">
      <View style={styles.cardHeader}>
        <Sparkles size={18} color={PURPLE} strokeWidth={2.2} />
        <Text style={styles.cardTitle}>Stay connected</Text>
      </View>
      <Text style={styles.cardSubtitle}>Meaningful ways to get started.</Text>
      <StayRow
        icon={<UserPlus size={16} color={PURPLE} strokeWidth={2.2} />}
        title="Find people"
        subtitle="Search for someone you know"
        onPress={openNetwork}
        testID="home-find-people"
      />
      <StayRow
        icon={<MessageCircle size={16} color={PURPLE} strokeWidth={2.2} />}
        title="Start a conversation"
        subtitle="Message a connection"
        onPress={() => router.push("/(app)/chat")}
        testID="home-start-conversation"
      />
      <StayRow
        icon={<UsersRound size={16} color={PURPLE} strokeWidth={2.2} />}
        title="Join a workspace"
        subtitle="Enter your team's workspace"
        onPress={() =>
          router.push({ pathname: "/onboarding", params: { mode: "join" } })
        }
        testID="home-join-workspace"
      />
      <Pressable
        onPress={() =>
          router.push({ pathname: "/onboarding", params: { mode: "create" } })
        }
        hitSlop={8}
        style={styles.createLink}
        accessibilityRole="button"
        accessibilityLabel="Create a workspace"
        testID="home-create-workspace"
      >
        <Text style={styles.createLinkText}>Create a workspace</Text>
      </Pressable>
    </View>
  );

  return (
    <View testID="home-no-workspace">
      <View style={[styles.hero, !wide ? styles.heroNarrow : null]}>
        <Image
          source={
            wide
              ? require("@/assets/home-no-workspace-hero.jpg")
              : require("@/assets/home-no-workspace-hero-narrow.jpg")
          }
          style={[styles.heroPhoto, !wide ? styles.heroPhotoNarrow : null]}
          resizeMode={wide ? "stretch" : "cover"}
          accessibilityIgnoresInvertColors
        />
        <LinearGradient
          colors={
            wide
              ? ["#F4F0FF", "rgba(244,240,255,0.94)", "rgba(244,240,255,0)"]
              : ["#F4F0FF", "rgba(244,240,255,0.92)", "rgba(244,240,255,0)"]
          }
          locations={[0, 0.56, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.heroFade, !wide ? styles.heroFadeNarrow : null]}
          pointerEvents="none"
        />
        <View style={[styles.heroCopy, !wide ? styles.heroCopyNarrow : null]}>
          <Text style={styles.heroEyebrow}>WELCOME TO ALENIO</Text>
          <Text style={[styles.heroTitle, !wide ? styles.heroTitleNarrow : null]}>
            Connect, learn, and grow.
          </Text>
          <Text style={[styles.heroBody, !wide ? styles.heroBodyNarrow : null]}>
            Build your network, discover insights, and stay inspired.
          </Text>
          <View
            style={[styles.heroActions, !wide ? styles.heroActionsNarrow : null]}
          >
            <Pressable
              onPress={openNetwork}
              style={[styles.heroPrimary, !wide ? styles.heroButtonNarrow : null]}
              accessibilityRole="button"
              accessibilityLabel="Build your network"
              testID="home-build-network"
            >
              <Users size={15} color="#FFFFFF" strokeWidth={2.3} />
              <Text
                style={[
                  styles.heroPrimaryText,
                  !wide ? styles.heroButtonTextNarrow : null,
                ]}
              >
                {wide ? "Build your network" : "Build network"}
              </Text>
            </Pressable>
            <Pressable
              onPress={onInsight}
              style={[
                styles.heroSecondary,
                !wide ? styles.heroSecondaryNarrow : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Explore insights"
              testID="home-explore-insights"
            >
              <Text
                style={[
                  styles.heroSecondaryText,
                  !wide ? styles.heroSecondaryTextNarrow : null,
                ]}
              >
                Explore insights
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {wide ? (
        <View style={styles.cardRow}>
          <View style={{ width: columnWidth }}>{networkCard}</View>
          <View style={{ width: columnWidth }}>{stayCard}</View>
        </View>
      ) : (
        <View style={styles.cardStack}>
          {networkCard}
          {stayCard}
        </View>
      )}

      <Pressable
        onPress={onInsight}
        style={[styles.insight, !wide ? styles.insightNarrow : null]}
        accessibilityRole="button"
        accessibilityLabel={insightTitle.replace(/\n/g, " ")}
        testID="home-no-workspace-insight"
      >
        <Image
          source={require("@/assets/home-insight-panorama-v4.jpg")}
          style={styles.insightPhoto}
          resizeMode="stretch"
          accessibilityIgnoresInvertColors
        />
        <View style={[styles.insightCopy, !wide ? styles.insightCopyNarrow : null]}>
          <View style={styles.insightLabelRow}>
            <Sparkles size={13} color={PURPLE} strokeWidth={2.3} />
            <Text style={styles.insightLabel}>Insight</Text>
          </View>
          <Text
            style={[styles.insightTitle, !wide ? styles.insightTitleNarrow : null]}
          >
            {insightTitle}
          </Text>
          {wide ? <Text style={styles.insightBody}>{insightBody}</Text> : null}
          <View
            style={[styles.insightAction, !wide ? styles.insightActionNarrow : null]}
          >
            <Text style={styles.insightActionText}>{insightAction}</Text>
            <ChevronRight size={14} color={PURPLE} strokeWidth={2.4} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function RequestRow({ entry }: { entry: ConnectionEntry }) {
  const name = entry.person.name?.trim() || "Someone";
  return (
    <Pressable
      onPress={() => openPerson(entry.person.id)}
      style={styles.requestRow}
      accessibilityRole="button"
      accessibilityLabel={`${name} sent you a connection request`}
    >
      <UserAvatar
        user={entry.person}
        size={40}
        radius={20}
        backgroundColor="#EEF2FF"
        resetKey={entry.id}
      />
      <View style={styles.requestCopy}>
        <Text style={styles.requestName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.requestMeta} numberOfLines={1}>
          Sent you a connection request
        </Text>
      </View>
    </Pressable>
  );
}

function StayRow({
  icon,
  title,
  subtitle,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.stayRow}
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
    >
      <View style={styles.stayIcon}>{icon}</View>
      <View style={styles.stayCopy}>
        <Text style={styles.stayTitle}>{title}</Text>
        <Text style={styles.staySubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={16} color="#C4B5FD" strokeWidth={2.3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 16,
    minHeight: 168,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#F4F0FF",
  },
  heroNarrow: {
    minHeight: 0,
  },
  heroPhoto: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "60%",
  },
  heroPhotoNarrow: {
    top: 0,
    bottom: 0,
    width: "100%",
  },
  heroFade: {
    position: "absolute",
    top: 0,
    left: "34%",
    bottom: 0,
    width: "28%",
  },
  heroFadeNarrow: {
    top: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: undefined,
  },
  heroCopy: {
    maxWidth: "62%",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  heroCopyNarrow: {
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  heroEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "#8B7CFF",
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#111A2B",
  },
  heroBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: "#667085",
  },
  heroTitleNarrow: {
    maxWidth: "76%",
    fontSize: 21,
    lineHeight: 25,
  },
  heroBodyNarrow: {
    maxWidth: "76%",
    fontSize: 12.5,
    lineHeight: 17,
  },
  heroActions: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  heroActionsNarrow: {
    flexWrap: "nowrap",
    gap: 6,
  },
  heroPrimary: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: PURPLE,
  },
  heroPrimaryText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroSecondary: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  heroSecondaryText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: PURPLE,
  },
  heroButtonNarrow: {
    height: 34,
    paddingHorizontal: 7,
  },
  heroButtonTextNarrow: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  heroSecondaryNarrow: {
    height: 30,
    paddingHorizontal: 2,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  heroSecondaryTextNarrow: {
    fontSize: 12,
    lineHeight: 16,
    textDecorationLine: "underline",
  },
  cardRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardStack: {
    marginTop: 12,
    gap: 12,
  },
  card: {
    borderRadius: 20,
    backgroundColor: "#F8F6FF",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  wideCard: {
    height: 248,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  cardLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cardLinkText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: PURPLE,
  },
  cardSubtitle: {
    marginTop: 2,
    marginBottom: 4,
    marginLeft: 26,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
  },
  statRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  statValue: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    color: "#111A2B",
  },
  statValueHot: {
    color: PURPLE,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#667085",
  },
  requestRow: {
    marginTop: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  requestCopy: {
    flex: 1,
    minWidth: 0,
  },
  requestName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: "#111A2B",
  },
  requestMeta: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
  },
  networkEmpty: {
    flex: 1,
    minHeight: 76,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  networkEmptyTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    color: "#111A2B",
  },
  networkEmptyText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#667085",
  },
  networkEmptyAction: {
    marginTop: 7,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFFFFF",
  },
  networkEmptyActionText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
    color: PURPLE,
  },
  stayRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stayIcon: {
    width: 28,
    alignItems: "center",
  },
  stayCopy: {
    flex: 1,
    minWidth: 0,
  },
  stayTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: "#111A2B",
  },
  staySubtitle: {
    fontSize: 13,
    lineHeight: 17,
    color: "#667085",
  },
  createLink: {
    alignSelf: "flex-start",
    marginLeft: 38,
    marginTop: 2,
    marginBottom: 8,
  },
  createLinkText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: PURPLE,
  },
  insight: {
    marginTop: 12,
    minHeight: 148,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#F8F6FF",
  },
  insightNarrow: {
    minHeight: 116,
  },
  insightPhoto: {
    position: "absolute",
    top: 0,
    right: 0,
    height: "100%",
    width: "100%",
  },
  insightCopy: {
    maxWidth: "52%",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  insightCopyNarrow: {
    maxWidth: "66%",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  insightLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  insightLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: PURPLE,
  },
  insightTitle: {
    marginTop: 6,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#111A2B",
  },
  insightTitleNarrow: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: -0.15,
  },
  insightBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#667085",
  },
  insightAction: {
    alignSelf: "flex-start",
    marginTop: 12,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#FFFFFF",
  },
  insightActionNarrow: {
    marginTop: 7,
    height: 27,
    paddingHorizontal: 9,
  },
  insightActionText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: PURPLE,
  },
});
