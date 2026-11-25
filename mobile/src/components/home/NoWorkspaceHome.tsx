import React, { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronRight,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react-native";

import { router } from "expo-router";
import { HomeDiscover } from "@/components/home/HomeDiscover";
import { HomeWorkspacePromo } from "@/components/home/HomeWorkspacePromo";
import { AddConnectionSheet } from "@/components/people/AddConnectionSheet";
import { ConnectionRequestsSheet } from "@/components/people/ConnectionRequestsSheet";
import { IconTile, tintInk } from "@/components/ui";
import type { HomeWorkspaceApiCard } from "@/lib/home-workspace-api";
import type { ConnectionsResponse } from "@/lib/types";
import { elevation, gradients, palette } from "@/theme";

const PURPLE = palette.violet;
/** Shared gap between stacked Home cards (phone). */
const CARD_GAP = 12;

/** Phone / half-column hero — ~2.2:1, same mountain + sparkle as the wide asset. */
const HOME_HERO_MOUNTAIN_HALF = require("@/assets/alenio-home-hero-mountain-half.jpg");
/** Wide / tablet hero — 16:9 of the same photo so cover never reframes the scene. */
const HOME_HERO_MOUNTAIN_WIDE = require("@/assets/alenio-home-hero-mountain-wide.jpg");

type Props = {
  connections: ConnectionsResponse | undefined;
  hasWorkspace: boolean;
  wide: boolean;
  columnWidth: number;
  /**
   * Wide Home: height left under the greeting. Today / Insight / Explore
   * share this so the pair fills the screen instead of floating short.
   */
  stackHeight?: number;
  todayCard?: React.ReactNode;
  /** When null, the Insight card is held until Home has a resolved card. */
  insightTitle: string | null;
  insightBody: string;
  insightAction: string;
  insightImage: ImageSourcePropType;
  onInsight: () => void;
  /** Active Alenio Workspace promos. Empty hides the card. */
  workspaceCards: HomeWorkspaceApiCard[];
  /** Scheduled card the dots open on. */
  workspaceStartIndex: number;
};

function openNetwork(tab: "feed" | "connections" = "feed") {
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
  stackHeight = 0,
  todayCard,
  insightTitle,
  insightBody,
  insightAction,
  insightImage,
  onInsight,
  workspaceCards,
  workspaceStartIndex,
}: Props) {
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [findPeopleOpen, setFindPeopleOpen] = useState(false);
  /** Phone stack: match Workspace banner height to the Explore card below. */
  const [exploreHeight, setExploreHeight] = useState(0);
  const onExploreLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next > 0 && next !== exploreHeight) setExploreHeight(next);
  };
  const networkReady = connections !== undefined;
  const accepted = connections?.accepted.length ?? 0;
  const incomingCount = connections?.incoming.length ?? 0;
  const networkStarted = accepted > 0;
  const showWelcomeHero =
    !hasWorkspace && networkReady && accepted < 3;
  const showInsight = insightTitle != null && insightTitle.length > 0;
  const showWorkspaceCard = !hasWorkspace && workspaceCards.length > 0;
  /** Network has its own tab. Home only speaks up when a request is waiting. */
  const networkSignal = networkReady && incomingCount > 0 ? (
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

  /** Alenio Workspace promo — Insight-style banner for no-workspace Home. */
  const workspaceCard = (flushTop = false, paired = false) => (
    <HomeWorkspacePromo
      cards={workspaceCards}
      startIndex={workspaceStartIndex}
      wide={wide}
      flushTop={flushTop}
      paired={paired}
      minHeight={!paired && exploreHeight > 0 ? exploreHeight : 0}
    />
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
        style={[styles.insight, paired ? styles.insightPaired : null]}
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
          {wide ? (
            <>
              <View style={styles.insightLabelRow}>
                <Sparkles size={12} color="#E9DDFF" strokeWidth={2.4} />
                <Text style={styles.insightLabel}>INSIGHT</Text>
              </View>
              <Text numberOfLines={2} style={styles.insightTitle}>
                {insightTitle}
              </Text>
              <Text style={styles.insightBody}>{insightBody}</Text>
              <LinearGradient
                colors={[...gradients.cta]}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0.3 }}
                style={styles.insightAction}
              >
                <Text style={styles.insightActionText}>{insightAction}</Text>
                <ChevronRight size={14} color="#FFFFFF" strokeWidth={2.4} />
              </LinearGradient>
            </>
          ) : (
            <View style={styles.insightHeaderMatch}>
              <IconTile tint="sky" size={32}>
                <Sparkles size={16} color={tintInk("sky")} strokeWidth={2.3} />
              </IconTile>
              <View style={styles.insightHeaderCopy}>
                <Text numberOfLines={1} style={styles.insightEyebrow}>
                  Insight
                </Text>
                <Text numberOfLines={2} style={styles.insightTitleMatch}>
                  {insightTitle}
                </Text>
                <Text style={styles.insightLink} numberOfLines={1}>
                  {insightAction} ›
                </Text>
              </View>
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );

  const welcomeHero = showWelcomeHero ? (
    <View style={[styles.heroShadow, wide ? styles.heroShadowWideCompact : null]}>
      <View style={[styles.hero, !wide ? styles.heroNarrow : styles.heroWideCompact]}>
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
                  ? openNetwork("feed")
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
            <View
              style={[
                styles.cardRow,
                styles.cardRowMatch,
                stackHeight > 0 ? { height: stackHeight } : null,
              ]}
            >
              <View style={[styles.todayColumn, { width: columnWidth }]}>
                <View style={styles.todayFill}>{todayCard}</View>
              </View>
              <View style={[styles.insightColumn, { width: columnWidth }]}>
                <View style={styles.insightGrow}>{insightCard(true, true)}</View>
                <View style={[styles.exploreSlot, { width: columnWidth }]}>
                  <HomeDiscover width={columnWidth} />
                </View>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.todaySlot}>{todayCard}</View>
              <HomeDiscover width={columnWidth} />
            </>
          )}
          {networkSignal ? (
            <View style={styles.belowPair}>{networkSignal}</View>
          ) : null}
        </>
      ) : (
        <>
          {todayCard ? <View style={styles.todaySlot}>{todayCard}</View> : null}

          {wide && !hasWorkspace && showWelcomeHero && showInsight ? (
            <>
              {/* Content-sized cards — do not stretch to the full sheet height. */}
              <View style={styles.cardRow}>
                <View style={{ width: columnWidth }}>{welcomeHero}</View>
                <View style={{ width: columnWidth }}>
                  {insightCard(true, false)}
                </View>
              </View>
              <View style={[styles.cardRow, styles.cardRowMatch]}>
                <View style={[styles.workspaceMatchColumn, { width: columnWidth }]}>
                  {showWorkspaceCard ? workspaceCard(true, true) : null}
                </View>
                <View style={{ width: columnWidth }}>
                  <HomeDiscover width={columnWidth} />
                </View>
              </View>
              {networkSignal ? (
                <View style={styles.belowPair}>{networkSignal}</View>
              ) : null}
            </>
          ) : wide && !hasWorkspace ? (
            <>
              {welcomeHero}
              {showInsight ? insightCard() : null}
              <View style={[styles.cardRow, styles.cardRowMatch]}>
                <View style={[styles.workspaceMatchColumn, { width: columnWidth }]}>
                  {showWorkspaceCard ? workspaceCard(true, true) : null}
                </View>
                <View style={{ width: columnWidth }}>
                  <HomeDiscover width={columnWidth} />
                </View>
              </View>
              {networkSignal ? (
                <View style={styles.belowPair}>{networkSignal}</View>
              ) : null}
            </>
          ) : (
            <View style={styles.phoneStack}>
              {welcomeHero}
              {showInsight ? insightCard(true) : null}
              {showWorkspaceCard ? workspaceCard(true) : null}
              {networkSignal ? (
                <View style={styles.phoneCard}>{networkSignal}</View>
              ) : null}
              <View
                style={styles.phoneCard}
                onLayout={showWorkspaceCard ? onExploreLayout : undefined}
              >
                <HomeDiscover />
              </View>
            </View>
          )}
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

const styles = StyleSheet.create({
  heroShadow: {
    ...elevation.card,
    marginTop: 0,
    borderRadius: 22,
    backgroundColor: "#F4F0FF",
  },
  heroShadowWide: {
    marginTop: 0,
    flex: 1,
    alignSelf: "stretch",
    minHeight: 0,
  },
  /** No-workspace wide: hug content, never fill the sheet. */
  heroShadowWideCompact: {
    marginTop: 0,
    alignSelf: "stretch",
  },
  hero: {
    minHeight: 0,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#F4F0FF",
  },
  heroWide: {
    flex: 1,
    alignSelf: "stretch",
    minHeight: 0,
    height: "100%",
  },
  heroWideCompact: {
    alignSelf: "stretch",
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
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
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
    marginTop: 4,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#111A2B",
  },
  heroBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 17,
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
    marginTop: 10,
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
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: PURPLE,
  },
  heroPrimaryText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroSecondary: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  heroSecondaryText: {
    fontSize: 13,
    lineHeight: 16,
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
  /** Workspace fills the row so it matches Explore beside it. */
  workspaceMatchColumn: {
    alignSelf: "stretch",
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
    alignItems: "stretch",
    justifyContent: "flex-start",
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
    gap: 10,
  },
  /** Insight fills leftover height above the content-sized Explore card. */
  insightGrow: {
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
    width: "100%",
  },
  exploreSlot: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
    width: "100%",
  },
  /** Phone stack: Insight's own top margin does not separate the card under it. */
  exploreStack: {
    marginTop: CARD_GAP,
  },
  /** Even gaps — one source of spacing, no stacked marginTop on children. */
  phoneStack: {
    gap: CARD_GAP,
  },
  phoneCard: {
    marginTop: 0,
  },
  todaySlot: {
    marginTop: CARD_GAP,
  },
  belowPair: {
    marginTop: CARD_GAP,
  },
  cardStack: {
    marginTop: CARD_GAP,
    gap: CARD_GAP,
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
  insightShadow: {
    ...elevation.raised,
    marginTop: CARD_GAP,
    backgroundColor: palette.dusk,
  },
  /** Fills leftover height above Explore (same as with-workspace). */
  insightShadowPaired: {
    marginTop: 0,
    flex: 1,
    alignSelf: "stretch",
    minHeight: 0,
  },
  insight: {
    minHeight: 0,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: palette.dusk,
    justifyContent: "flex-start",
  },
  insightPaired: {
    flex: 1,
    alignSelf: "stretch",
    minHeight: 0,
    height: "100%",
  },
  insightFlush: {
    marginTop: 0,
  },
  insightPhoto: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
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
    maxWidth: "58%",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  /** Content-sized so the trophy sits beside the copy, not under empty purple. */
  insightCopyNarrow: {
    maxWidth: "62%",
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  /** Same row as Explore's header: 32pt icon, 10pt gap, title beside it. */
  insightHeaderMatch: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  insightHeaderCopy: {
    flexShrink: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  insightEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#E9DDFF",
  },
  insightTitleMatch: {
    marginTop: 2,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#FFFFFF",
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
  insightLabelNarrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  insightTitle: {
    marginTop: 5,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#FFFFFF",
  },
  insightTitleNarrow: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: 0,
  },
  insightBody: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.72)",
  },
  insightAction: {
    alignSelf: "flex-start",
    marginTop: 10,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  insightLink: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#E9DDFF",
  },
  insightActionText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
