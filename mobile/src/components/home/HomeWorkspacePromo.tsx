import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import type { HomeWorkspaceApiCard } from "@/lib/home-workspace-api";
import {
  nextWorkspacePromoIndex,
  previousWorkspacePromoIndex,
  WORKSPACE_PROMO_ADVANCE_MS,
} from "@/lib/home-workspace-deck";
import { elevation, gradients, palette } from "@/theme";

const ALENIO_ICON = require("@/assets/alenio-icon.png");

const DOT = 6;
const DOT_ACTIVE = 16;

type Props = {
  cards: HomeWorkspaceApiCard[];
  startIndex: number;
  wide: boolean;
  flushTop?: boolean;
  paired?: boolean;
  minHeight?: number;
};

function useHoldStill(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (active) setScreenReader(enabled);
    });
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    const reader = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReader,
    );
    return () => {
      active = false;
      motion.remove();
      reader.remove();
    };
  }, []);

  return reduceMotion || screenReader;
}

function openWorkspaceCard(card: HomeWorkspaceApiCard) {
  router.push({
    pathname: "/onboarding",
    params: {
      mode: card.destination.type === "join" ? "join" : "create",
    },
  });
}

function PromoFace({
  card,
  wide,
  showDots,
  width,
  height,
  minHeight,
  fill,
  current,
  onPressIn,
  onPressOut,
}: {
  card: HomeWorkspaceApiCard;
  wide: boolean;
  showDots: boolean;
  width?: number;
  height?: number;
  minHeight: number;
  fill?: boolean;
  current?: boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
}) {
  const title = card.title.replace(/\n/g, " ");
  return (
    <Pressable
      onPress={() => openWorkspaceCard(card)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        styles.face,
        fill ? styles.faceFill : null,
        width != null && width > 0 ? { width } : null,
        height != null && height > 0 ? { height } : null,
        minHeight > 0 ? { minHeight } : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Workspaces. ${title}. ${card.actionLabel}`}
      accessibilityElementsHidden={current === false}
      importantForAccessibility={
        current === false ? "no-hide-descendants" : "auto"
      }
      testID={current === false ? undefined : "home-workspace-promo-action"}
    >
      {card.imageUrl ? (
        <Image
          source={{ uri: card.imageUrl }}
          style={styles.photo}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          accessibilityLabel={card.imageAlt ?? undefined}
        />
      ) : null}
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
        style={styles.fade}
      />
      <View
        style={[
          styles.copy,
          !wide ? styles.copyNarrow : null,
          showDots ? styles.copyWithDots : null,
        ]}
      >
        <View style={styles.copyTop}>
          <View style={styles.brandRow}>
            <Image
              source={ALENIO_ICON}
              style={styles.brandIcon}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text style={styles.brandLabel}>Workspaces</Text>
          </View>
          <Text style={styles.title} numberOfLines={wide ? 3 : 2}>
            {card.title}
          </Text>
          {card.body ? (
            <Text style={styles.body} numberOfLines={wide ? 4 : 3}>
              {card.body}
            </Text>
          ) : null}
        </View>
        <LinearGradient
          colors={[...gradients.cta]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.3 }}
          style={styles.action}
        >
          <Text style={styles.actionText}>{card.actionLabel}</Text>
          <ChevronRight size={14} color="#FFFFFF" strokeWidth={2.4} />
        </LinearGradient>
      </View>
    </Pressable>
  );
}

export function HomeWorkspacePromo({
  cards,
  startIndex,
  wide,
  flushTop = false,
  paired = false,
  minHeight = 0,
}: Props) {
  const holdStill = useHoldStill();
  const count = cards.length;
  const safeStart = count === 0 ? 0 : Math.max(0, Math.min(count - 1, startIndex));
  const deckKey = cards.map((card) => card.id).join("|");
  const [pageIndex, setPageIndex] = useState(safeStart);
  const [pageWidth, setPageWidth] = useState(0);
  const [frameHeight, setFrameHeight] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const scrollRef = useRef<ScrollView | null>(null);
  const pageIndexRef = useRef(pageIndex);
  const pausedRef = useRef(paused);
  const draggingRef = useRef(false);
  const programmaticRef = useRef(false);
  const placementKey = `${deckKey}:${safeStart}`;
  const [trackedPlacement, setTrackedPlacement] = useState(placementKey);

  if (trackedPlacement !== placementKey) {
    pageIndexRef.current = safeStart;
    setTrackedPlacement(placementKey);
    setPageIndex(safeStart);
  }
  pausedRef.current = paused;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setAppActive(next === "active");
    });
    return () => subscription.remove();
  }, []);

  const onFrame = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextWidth > 0 && nextWidth !== pageWidth) setPageWidth(nextWidth);
    if (nextHeight > 0 && nextHeight !== frameHeight) setFrameHeight(nextHeight);
  };

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      if (count === 0 || pageWidth <= 0) return;
      const next = ((index % count) + count) % count;
      const shouldAnimate = animated && !holdStill;
      programmaticRef.current = shouldAnimate;
      pageIndexRef.current = next;
      setPageIndex((currentIndex) => (currentIndex === next ? currentIndex : next));
      scrollRef.current?.scrollTo({
        x: next * pageWidth,
        animated: shouldAnimate,
      });
      if (!shouldAnimate) programmaticRef.current = false;
    },
    [count, holdStill, pageWidth],
  );

  useEffect(() => {
    if (pageWidth <= 0 || count === 0) return;
    scrollRef.current?.scrollTo({
      x: pageIndexRef.current * pageWidth,
      animated: false,
    });
  }, [count, deckKey, pageWidth, safeStart]);

  useEffect(() => {
    if (count < 2 || pageWidth <= 0 || paused || !focused || !appActive || holdStill) {
      return;
    }
    const timer = setTimeout(() => {
      if (pausedRef.current) return;
      const next = nextWorkspacePromoIndex(pageIndexRef.current, count);
      scrollToIndex(next, true);
    }, WORKSPACE_PROMO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [
    appActive,
    count,
    focused,
    holdStill,
    pageIndex,
    pageWidth,
    paused,
    scrollToIndex,
  ]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (programmaticRef.current || pageWidth <= 0 || count === 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    const clamped = Math.max(0, Math.min(count - 1, next));
    if (clamped === pageIndexRef.current) return;
    pageIndexRef.current = clamped;
    setPageIndex(clamped);
  };

  const onScrollBeginDrag = () => {
    programmaticRef.current = false;
    draggingRef.current = true;
    setPaused(true);
  };

  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const velocity = event.nativeEvent.velocity?.x ?? 0;
    if (Math.abs(velocity) > 0.05) return;
    draggingRef.current = false;
    setPaused(false);
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    programmaticRef.current = false;
    draggingRef.current = false;
    if (pageWidth > 0 && count > 0) {
      const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      const clamped = Math.max(0, Math.min(count - 1, next));
      pageIndexRef.current = clamped;
      setPageIndex((currentIndex) => (currentIndex === clamped ? currentIndex : clamped));
    }
    setPaused(false);
  };

  if (count === 0) return null;

  const current = cards[pageIndex] ?? cards[safeStart]!;
  const showDots = count > 1;
  const pagerReady = pageWidth > 0 && (!paired || frameHeight > 0);
  const pageHeight = paired && frameHeight > 0 ? frameHeight : undefined;
  const face = (card: HomeWorkspaceApiCard, width?: number, index?: number) => (
    <PromoFace
      card={card}
      wide={wide}
      showDots={showDots}
      width={width}
      height={pageHeight}
      minHeight={minHeight}
      fill={paired && pageHeight == null}
      current={index == null || index === pageIndex}
      onPressIn={() => setPaused(true)}
      onPressOut={() => {
        if (!draggingRef.current) setPaused(false);
      }}
    />
  );

  return (
    <View
      style={[
        styles.shadow,
        flushTop ? styles.flush : null,
        paired ? styles.paired : null,
        !paired && minHeight > 0 ? { minHeight } : null,
      ]}
      testID="home-workspace-promo"
    >
      <View
        style={[styles.clip, paired ? styles.clipPaired : null]}
        onLayout={onFrame}
        collapsable={false}
        accessibilityRole={showDots ? "adjustable" : undefined}
        accessibilityLabel={
          showDots
            ? `Workspaces. Card ${pageIndex + 1} of ${count}. ${current.title.replace(/\n/g, " ")}`
            : undefined
        }
        accessibilityActions={
          showDots
            ? [{ name: "increment" }, { name: "decrement" }]
            : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") {
            scrollToIndex(nextWorkspacePromoIndex(pageIndex, count), true);
          }
          if (event.nativeEvent.actionName === "decrement") {
            scrollToIndex(previousWorkspacePromoIndex(pageIndex, count), true);
          }
        }}
      >
        {pagerReady ? (
          <ScrollView
            key={deckKey}
            ref={scrollRef}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            directionalLockEnabled
            scrollEnabled={showDots}
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            style={
              paired
                ? { width: pageWidth, height: frameHeight }
                : styles.pager
            }
            contentOffset={{ x: pageIndexRef.current * pageWidth, y: 0 }}
            onScroll={onScroll}
            scrollEventThrottle={32}
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={onScrollEndDrag}
            onMomentumScrollEnd={onMomentumScrollEnd}
          >
            {cards.map((card, index) => (
              <View key={card.id}>{face(card, pageWidth, index)}</View>
            ))}
          </ScrollView>
        ) : (
          face(cards[safeStart]!)
        )}

        {showDots ? (
          <View pointerEvents="box-none" style={styles.dotsOverlay}>
            <View style={styles.dotsRow} testID="home-workspace-promo-dots">
              {cards.map((card, index) => {
                const selected = index === pageIndex;
                return (
                  <Pressable
                    key={card.id}
                    onPress={() => scrollToIndex(index, true)}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`${card.title.replace(/\n/g, " ")}. Card ${index + 1} of ${count}`}
                    accessibilityState={{ selected }}
                    testID={`home-workspace-promo-dot-${index}`}
                    style={styles.dotHit}
                  >
                    <View style={[styles.dot, selected ? styles.dotSelected : null]} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    ...elevation.raised,
    marginTop: 12,
    backgroundColor: palette.dusk,
    borderRadius: 18,
  },
  flush: {
    marginTop: 0,
  },
  paired: {
    marginTop: 0,
    flex: 1,
    alignSelf: "stretch",
    minHeight: 0,
  },
  clip: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: palette.dusk,
  },
  clipPaired: {
    flex: 1,
    alignSelf: "stretch",
    minHeight: 0,
  },
  pager: {
    flexGrow: 0,
  },
  face: {
    minHeight: 0,
    justifyContent: "flex-start",
    backgroundColor: palette.dusk,
  },
  faceFill: {
    flex: 1,
  },
  photo: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  fade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  copy: {
    flex: 1,
    alignSelf: "stretch",
    maxWidth: "64%",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  copyNarrow: {
    maxWidth: "62%",
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  copyWithDots: {
    paddingBottom: 36,
  },
  copyTop: {
    gap: 8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandIcon: {
    width: 18,
    height: 18,
  },
  brandLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: "#FFFFFF",
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#FFFFFF",
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: "rgba(255,255,255,0.78)",
  },
  action: {
    alignSelf: "flex-start",
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  actionText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  dotsOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 8,
    alignItems: "center",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  dotHit: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotSelected: {
    width: DOT_ACTIVE,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: "#FFFFFF",
  },
});
