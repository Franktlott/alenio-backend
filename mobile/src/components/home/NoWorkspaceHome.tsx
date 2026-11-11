import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
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
import { HomeDiscover } from "@/components/home/HomeDiscover";
import {
  AlenioList,
  AlenioListRow,
  Button,
  buttonInk,
  IconTile,
  PanelHeader,
  tintInk,
  type TintName,
} from "@/components/ui";
import type { ConnectionsResponse } from "@/lib/types";
import { elevation, gradients, palette, premiumType, tints } from "@/theme";

const PURPLE = palette.violet;

type Props = {
  connections: ConnectionsResponse | undefined;
  hasWorkspace: boolean;
  wide: boolean;
  columnWidth: number;
  todayCard?: React.ReactNode;
  /** Messages and mentions waiting on the user. Sits beside or under Today. */
  waitingCard?: React.ReactNode;
  insightTitle: string;
  insightBody: string;
  insightAction: string;
  insightImage: ImageSourcePropType;
  onInsight: () => void;
};

function openNetwork(tab: "updates" | "connections" = "updates") {
  router.push({
    pathname: "/(app)/team",
    params: { tab },
  });
}

export function NoWorkspaceHome({
  connections,
  hasWorkspace,
  wide,
  columnWidth,
  todayCard,
  waitingCard,
  insightTitle,
  insightBody,
  insightAction,
  insightImage,
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
  const networkStarted = accepted > 0;
  const showWelcomeHero =
    !hasWorkspace && connections !== undefined && accepted < 3;

  const networkCard = (
    <View
      style={[styles.card, wide && !hasWorkspace ? styles.wideCard : null]}
      testID="home-network-card"
    >
      <PanelHeader
        title="Your network"
        tint="mint"
        icon={<Users size={16} color={tintInk("mint")} strokeWidth={2.2} />}
        action={
          <Button
            variant="link"
            label="View network"
            onPress={() => openNetwork("connections")}
            iconRight={<ChevronRight size={14} color={buttonInk("link")} strokeWidth={2.4} />}
          />
        }
      />
      <View style={styles.statRow}>
        {stats.map((stat) => (
          <Pressable
            key={stat.key}
            onPress={() => openNetwork("connections")}
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
      {networkIsEmpty ? (
        <View style={styles.networkEmpty}>
          <Text style={styles.networkEmptyTitle}>Your network starts here</Text>
          <Text style={styles.networkEmptyText}>
            Find someone you already know on Alenio.
          </Text>
          <Button
            variant="soft"
            size="sm"
            label="Find people"
            onPress={() => openNetwork("connections")}
            icon={<UserPlus size={13} color={buttonInk("soft")} strokeWidth={2.3} />}
            testID="home-network-empty-find"
            style={{ alignSelf: "center", marginTop: 7 }}
          />
        </View>
      ) : null}
    </View>
  );

  const stayCard = (
    <View style={[styles.card, wide ? styles.wideCard : null]} testID="home-stay-connected">
      <PanelHeader
        title="Stay connected"
        subtitle="Meaningful ways to get started."
        icon={<Sparkles size={16} color={tintInk("lavender")} strokeWidth={2.2} />}
      />
      <AlenioList card={false}>
        <StayRow
          icon={<UserPlus size={16} color={tintInk("lavender")} strokeWidth={2.2} />}
          tint="lavender"
          title="Find people"
          subtitle="Search for someone you know"
          onPress={() => openNetwork("connections")}
          testID="home-find-people"
        />
        <StayRow
          icon={<MessageCircle size={16} color={tintInk("peach")} strokeWidth={2.2} />}
          tint="peach"
          title="Start a conversation"
          subtitle="Message a connection"
          onPress={() => router.push("/(app)/chat")}
          testID="home-start-conversation"
        />
        <StayRow
          icon={<UsersRound size={16} color={tintInk("sky")} strokeWidth={2.2} />}
          tint="sky"
          title="Join a workspace"
          subtitle="Enter your team's workspace"
          onPress={() =>
            router.push({ pathname: "/onboarding", params: { mode: "join" } })
          }
          testID="home-join-workspace"
        />
      </AlenioList>
      <Button
        variant="link"
        label="Create a workspace"
        onPress={() =>
          router.push({ pathname: "/onboarding", params: { mode: "create" } })
        }
        testID="home-create-workspace"
        style={styles.createLink}
      />
    </View>
  );

  /** The shadow lives on an outer view: iOS drops it on a view that clips. */
  const insightCard = (flushTop = false) => (
    <View
      style={[
        styles.insightShadow,
        flushTop ? styles.insightFlush : null,
      ]}
    >
      <Pressable
        onPress={onInsight}
        style={[styles.insight, !wide ? styles.insightNarrow : null]}
        accessibilityRole="button"
        accessibilityLabel={insightTitle.replace(/\n/g, " ")}
        testID="home-no-workspace-insight"
      >
        <Image
          source={insightImage}
          style={styles.insightPhoto}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <LinearGradient
          colors={[
            "rgba(20,9,56,0.96)",
            "rgba(26,11,69,0.86)",
            "rgba(42,15,99,0.45)",
            "rgba(42,15,99,0.05)",
          ]}
          locations={[0, 0.42, 0.66, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          style={styles.insightFade}
        />
        <View style={[styles.insightCopy, !wide ? styles.insightCopyNarrow : null]}>
          <View style={styles.insightLabelRow}>
            <Sparkles size={12} color="#E9DDFF" strokeWidth={2.4} />
            <Text style={styles.insightLabel}>INSIGHT</Text>
          </View>
          <Text
            style={[styles.insightTitle, !wide ? styles.insightTitleNarrow : null]}
          >
            {insightTitle}
          </Text>
          {wide ? <Text style={styles.insightBody}>{insightBody}</Text> : null}
          <LinearGradient
            colors={[...gradients.cta]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.3 }}
            style={[styles.insightAction, !wide ? styles.insightActionNarrow : null]}
          >
            <Text style={styles.insightActionText}>{insightAction}</Text>
            <ChevronRight size={14} color="#FFFFFF" strokeWidth={2.4} />
          </LinearGradient>
        </View>
      </Pressable>
    </View>
  );

  return (
    <View testID="home-no-workspace">
      {showWelcomeHero ? (
        <View style={styles.heroShadow}>
        <View style={[styles.hero, !wide ? styles.heroNarrow : null]}>
          <Image
            source={require("@/assets/alenio-welcome-mountain-ridge-v2.jpg")}
            style={[styles.heroPhoto, !wide ? styles.heroPhotoNarrow : null]}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <LinearGradient
            colors={[
              "#F7F5FF",
              "rgba(247,245,255,0.94)",
              "rgba(247,245,255,0.55)",
              "rgba(247,245,255,0.12)",
            ]}
            locations={[0, 0.38, 0.62, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            pointerEvents="none"
            style={styles.heroWash}
          />
          <View style={[styles.heroCopy, !wide ? styles.heroCopyNarrow : null]}>
            <Text style={styles.heroEyebrow}>
              {networkStarted ? "YOUR NETWORK" : "WELCOME TO ALENIO"}
            </Text>
            <Text style={[styles.heroTitle, !wide ? styles.heroTitleNarrow : null]}>
              {networkStarted
                ? "Your network is taking shape."
                : "Connect, learn, and grow."}
            </Text>
            <Text style={[styles.heroBody, !wide ? styles.heroBodyNarrow : null]}>
              {networkStarted
                ? "See what’s new and keep building meaningful connections."
                : "Build your network, discover insights, and stay inspired."}
            </Text>
            <View
              style={[styles.heroActions, !wide ? styles.heroActionsNarrow : null]}
            >
              <Pressable
                onPress={() =>
                  openNetwork(networkStarted ? "updates" : "connections")
                }
                style={[
                  styles.heroPrimary,
                  !wide ? styles.heroButtonNarrow : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  networkStarted ? "View network updates" : "Build your network"
                }
                testID="home-build-network"
              >
                <Users size={15} color="#FFFFFF" strokeWidth={2.3} />
                <Text
                  style={[
                    styles.heroPrimaryText,
                    !wide ? styles.heroButtonTextNarrow : null,
                  ]}
                >
                  {networkStarted
                    ? "View updates"
                    : wide
                      ? "Build your network"
                      : "Build network"}
                </Text>
              </Pressable>
              <Pressable
                onPress={
                  networkStarted
                    ? () => openNetwork("connections")
                    : onInsight
                }
                style={[
                  styles.heroSecondary,
                  !wide ? styles.heroSecondaryNarrow : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  networkStarted ? "Find people" : "Explore insights"
                }
                testID="home-explore-insights"
              >
                <Text
                  style={[
                    styles.heroSecondaryText,
                    !wide ? styles.heroSecondaryTextNarrow : null,
                  ]}
                >
                  {networkStarted ? "Find people" : "Explore insights"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        </View>
      ) : null}

      {wide && hasWorkspace && todayCard ? (
        <View style={[styles.cardRow, styles.cardRowMatch]}>
          <View style={[styles.todayColumn, { width: columnWidth }]}>
            <View style={styles.todayFill}>{todayCard}</View>
          </View>
          <View style={[styles.cardStack, styles.columnStack, { width: columnWidth }]}>
            {waitingCard}
            {networkCard}
            {insightCard(true)}
          </View>
        </View>
      ) : (
        <>
          {todayCard ? <View style={styles.todaySlot}>{todayCard}</View> : null}
          {waitingCard ? <View style={styles.todaySlot}>{waitingCard}</View> : null}

          {wide && !hasWorkspace ? (
            <View style={styles.cardRow}>
              <View style={{ width: columnWidth }}>{networkCard}</View>
              <View style={{ width: columnWidth }}>{stayCard}</View>
            </View>
          ) : (
            <View style={styles.cardStack}>
              {networkCard}
              {!hasWorkspace ? stayCard : null}
            </View>
          )}

          {insightCard()}
        </>
      )}
      <HomeDiscover wide={wide} />
    </View>
  );
}

function StayRow({
  icon,
  tint,
  title,
  subtitle,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  tint: TintName;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <AlenioListRow
      leading={<IconTile tint={tint}>{icon}</IconTile>}
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      chevron
      accessibilityLabel={title}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  heroShadow: {
    ...elevation.card,
    marginTop: 8,
    borderRadius: 22,
    backgroundColor: "#F4F0FF",
  },
  hero: {
    minHeight: 168,
    borderRadius: 21,
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
    width: "100%",
  },
  heroPhotoNarrow: {
    top: 0,
    bottom: 0,
    width: "100%",
  },
  heroWash: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
  /** Today stretches to the network and insight stack, and does not set the row height. */
  cardRowMatch: {
    alignItems: "stretch",
  },
  todayColumn: {
    alignSelf: "stretch",
  },
  todayFill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  todaySlot: {
    marginTop: 12,
  },
  cardStack: {
    marginTop: 14,
    gap: 14,
  },
  /** Beside Today, so the row's own top margin is the only offset. */
  columnStack: {
    marginTop: 0,
  },
  card: {
    ...elevation.card,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  wideCard: {
    height: 248,
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
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#EEE9FB",
    backgroundColor: "#FAF8FF",
  },
  statValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: palette.ink,
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
  createLink: {
    alignSelf: "flex-start",
    marginLeft: 42,
    marginTop: 2,
    marginBottom: 8,
  },
  insightShadow: {
    ...elevation.raised,
    marginTop: 14,
    backgroundColor: palette.dusk,
  },
  insight: {
    minHeight: 148,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: palette.dusk,
  },
  insightFlush: {
    marginTop: 0,
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
  insightFade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#E9DDFF",
  },
  insightTitle: {
    marginTop: 8,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#FFFFFF",
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
    color: "rgba(255,255,255,0.72)",
  },
  insightAction: {
    alignSelf: "flex-start",
    marginTop: 14,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
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
    color: "#FFFFFF",
  },
});
