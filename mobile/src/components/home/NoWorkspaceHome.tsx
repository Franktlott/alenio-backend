import React, { useState } from "react";
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
import { AddConnectionSheet } from "@/components/people/AddConnectionSheet";
import { ConnectionRequestsSheet } from "@/components/people/ConnectionRequestsSheet";
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
import { elevation, gradients, palette } from "@/theme";

const PURPLE = palette.violet;

/** Phone / half-column hero — ~2.2:1, same mountain + sparkle as the wide asset. */
const HOME_HERO_MOUNTAIN_HALF = require("@/assets/alenio-home-hero-mountain-half.jpg");
/** Wide / tablet hero — 16:9 of the same photo so cover never reframes the scene. */
const HOME_HERO_MOUNTAIN_WIDE = require("@/assets/alenio-home-hero-mountain-wide.jpg");

type Props = {
  connections: ConnectionsResponse | undefined;
  hasWorkspace: boolean;
  wide: boolean;
  columnWidth: number;
  todayCard?: React.ReactNode;
  /** Messages and mentions waiting on the user. Sits beside or under Today. */
  waitingCard?: React.ReactNode;
  /** When null, the Insight card is held until Home has a resolved card. */
  insightTitle: string | null;
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
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [findPeopleOpen, setFindPeopleOpen] = useState(false);
  const networkReady = connections !== undefined;
  const accepted = connections?.accepted.length ?? 0;
  const incomingCount = connections?.incoming.length ?? 0;
  const sent = connections?.outgoing.length ?? 0;
  const networkIsEmpty =
    networkReady && accepted === 0 && incomingCount === 0 && sent === 0;
  const networkStarted = accepted > 0;
  const showWelcomeHero =
    !hasWorkspace && networkReady && accepted < 3;
  const showInsight = insightTitle != null && insightTitle.length > 0;
  /**
   * Network has its own tab now — Home only surfaces a signal when someone is
   * waiting, or an empty-state nudge for brand-new accounts.
   */
  const networkSignal = networkIsEmpty ? (
    <View
      style={[styles.card, wide && !hasWorkspace ? styles.wideCard : null]}
      testID="home-network-empty"
    >
      <PanelHeader
        title="Your network"
        tint="mint"
        icon={<Users size={16} color={tintInk("mint")} strokeWidth={2.2} />}
      />
      <View style={styles.networkEmpty}>
        <Text style={styles.networkEmptyTitle}>Your network starts here</Text>
        <Text style={styles.networkEmptyText}>
          Find someone you already know on Alenio.
        </Text>
        <Button
          variant="soft"
          size="sm"
          label="Find people"
          onPress={() => setFindPeopleOpen(true)}
          icon={<UserPlus size={13} color={buttonInk("soft")} strokeWidth={2.3} />}
          testID="home-network-empty-find"
          style={{ alignSelf: "center", marginTop: 7 }}
        />
      </View>
    </View>
  ) : networkReady && incomingCount > 0 ? (
    <View style={styles.card} testID="home-network-requests">
      <Pressable
        onPress={() => setRequestsOpen(true)}
        style={styles.requestsRow}
        accessibilityRole="button"
        accessibilityLabel={
          incomingCount === 1
            ? "1 connection request waiting"
            : `${incomingCount} connection requests waiting`
        }
        testID="home-network-requests-row"
      >
        <IconTile tint="lavender">
          <UserPlus size={16} color={tintInk("lavender")} strokeWidth={2.2} />
        </IconTile>
        <View style={styles.requestsCopy}>
          <Text style={styles.requestsTitle}>
            {incomingCount === 1
              ? "1 connection request"
              : `${incomingCount} connection requests`}
          </Text>
          <Text style={styles.requestsSubtitle}>Waiting for your response</Text>
        </View>
        <Text style={styles.requestsCount}>{incomingCount}</Text>
        <ChevronRight size={16} color={PURPLE} strokeWidth={2.3} />
      </Pressable>
    </View>
  ) : null;

  const stayCard = (paired = false) => (
    <View
      style={[
        styles.card,
        wide ? styles.wideCard : null,
        paired ? styles.stayBesideHero : null,
      ]}
      testID="home-stay-connected"
    >
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
          onPress={() => setFindPeopleOpen(true)}
          testID="home-find-people"
        />
        <StayRow
          icon={
            <MessageCircle size={16} color={tintInk("peach")} strokeWidth={2.2} />
          }
          tint="peach"
          title="Start a conversation"
          subtitle="Message a connection"
          onPress={() => router.push("/(app)/chat")}
          testID="home-start-conversation"
        />
        <StayRow
          icon={
            <UsersRound size={16} color={tintInk("sky")} strokeWidth={2.2} />
          }
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
  const insightCard = (flushTop = false, paired = false) => (
    <View
      style={[
        styles.insightShadow,
        flushTop ? styles.insightFlush : null,
        paired ? styles.insightShadowPaired : null,
      ]}
    >
      <Pressable
        onPress={onInsight}
        style={[
          styles.insight,
          !wide ? styles.insightNarrow : null,
          paired ? styles.insightPaired : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={(insightTitle ?? "").replace(/\n/g, " ")}
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

  const welcomeHero = showWelcomeHero ? (
    <View style={[styles.heroShadow, wide ? styles.heroShadowWide : null]}>
      <View style={[styles.hero, !wide ? styles.heroNarrow : styles.heroWide]}>
        <Image
          source={wide ? HOME_HERO_MOUNTAIN_WIDE : HOME_HERO_MOUNTAIN_HALF}
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
        <View
          style={[
            styles.heroCopy,
            !wide ? styles.heroCopyNarrow : styles.heroCopyWide,
          ]}
        >
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
                networkStarted
                  ? openNetwork("updates")
                  : setFindPeopleOpen(true)
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
                networkStarted ? () => setFindPeopleOpen(true) : onInsight
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
  ) : null;

  return (
    <View testID="home-no-workspace">
      {wide && hasWorkspace && todayCard ? (
        <>
          {showInsight ? (
            <View style={[styles.cardRow, styles.cardRowMatch]}>
              <View style={[styles.todayColumn, { width: columnWidth }]}>
                <View style={styles.todayFill}>{todayCard}</View>
              </View>
              <View style={[styles.insightColumn, { width: columnWidth }]}>
                {insightCard(true, true)}
              </View>
            </View>
          ) : (
            <View style={styles.todaySlot}>{todayCard}</View>
          )}
          {waitingCard ? <View style={styles.belowPair}>{waitingCard}</View> : null}
          {networkSignal ? (
            <View style={styles.belowPair}>{networkSignal}</View>
          ) : null}
          <HomeDiscover wide={wide} />
        </>
      ) : (
        <>
          {todayCard ? <View style={styles.todaySlot}>{todayCard}</View> : null}
          {waitingCard ? <View style={styles.todaySlot}>{waitingCard}</View> : null}

          {wide && !hasWorkspace && showWelcomeHero ? (
            <>
              <View style={[styles.cardRow, styles.cardRowMatch, styles.heroPairRow]}>
                <View style={{ width: columnWidth }}>{welcomeHero}</View>
                <View style={{ width: columnWidth }}>{stayCard(true)}</View>
              </View>
              {networkSignal ? (
                <View style={styles.belowPair}>{networkSignal}</View>
              ) : null}
            </>
          ) : (
            <>
              {welcomeHero}
              {wide && !hasWorkspace ? (
                <View style={styles.cardRow}>
                  {networkSignal ? (
                    <View style={{ width: columnWidth }}>{networkSignal}</View>
                  ) : null}
                  <View style={{ width: columnWidth }}>{stayCard()}</View>
                </View>
              ) : (
                <View style={styles.cardStack}>
                  {networkSignal}
                  {!hasWorkspace ? stayCard() : null}
                </View>
              )}
            </>
          )}

          <HomeDiscover wide={wide} />
          {showInsight ? insightCard() : null}
        </>
      )}
      <ConnectionRequestsSheet
        visible={requestsOpen}
        onClose={() => setRequestsOpen(false)}
        initialTab="received"
      />
      <AddConnectionSheet
        visible={findPeopleOpen}
        entryMode="all"
        hasWorkspaces={hasWorkspace}
        onClose={() => setFindPeopleOpen(false)}
      />
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
  heroShadowWide: {
    marginTop: 0,
    flex: 1,
    minHeight: 248,
  },
  hero: {
    minHeight: 168,
    borderRadius: 21,
    overflow: "hidden",
    backgroundColor: "#F4F0FF",
  },
  heroWide: {
    flex: 1,
    minHeight: 248,
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
  heroCopyWide: {
    maxWidth: "78%",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  heroCopyNarrow: {
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  heroPairRow: {
    marginTop: 8,
  },
  stayBesideHero: {
    marginTop: 0,
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
  /** Today stretches to the Insight column beside it. */
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
  insightColumn: {
    alignSelf: "stretch",
  },
  todaySlot: {
    marginTop: 12,
  },
  belowPair: {
    marginTop: 14,
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
  requestsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  requestsCopy: {
    flex: 1,
    minWidth: 0,
  },
  requestsTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.ink,
  },
  requestsSubtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
  },
  requestsCount: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    color: PURPLE,
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
  insightShadowPaired: {
    flex: 1,
    minHeight: 228,
  },
  insight: {
    minHeight: 148,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: palette.dusk,
  },
  insightPaired: {
    flex: 1,
    minHeight: 228,
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
