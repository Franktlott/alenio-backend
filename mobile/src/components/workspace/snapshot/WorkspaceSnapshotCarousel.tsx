import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { WS } from "@/components/workspace/workspace-ui";
import {
  SnapshotMetricCard,
  useReduceMotion,
} from "@/components/workspace/snapshot/SnapshotMetricCard";
import type { SnapshotPage } from "@/components/workspace/snapshot/snapshot-types";

const CARD_PADDING = 12;
const CARD_PADDING_VERTICAL = 6;
const CARD_BORDER = 1;
const METRIC_GAP = 5;
const METRICS_PER_PAGE = 4;
const METRIC_ROW_MIN_HEIGHT = 42;
const DOT_SIZE = 4;
const DOT_ACTIVE_WIDTH = 12;

type Props = {
  pages: SnapshotPage[];
  loading?: boolean;
};

function PageDots({
  count,
  scrollX,
  pageWidth,
}: {
  count: number;
  scrollX: Animated.Value;
  pageWidth: number;
}) {
  return (
    <View
      style={styles.dotsRow}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, index) => {
        const inputRange = [
          (index - 1) * pageWidth,
          index * pageWidth,
          (index + 1) * pageWidth,
        ];
        return (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                width: scrollX.interpolate({
                  inputRange,
                  outputRange: [DOT_SIZE, DOT_ACTIVE_WIDTH, DOT_SIZE],
                  extrapolate: "clamp",
                }),
                opacity: scrollX.interpolate({
                  inputRange,
                  outputRange: [0.3, 1, 0.3],
                  extrapolate: "clamp",
                }),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export function WorkspaceSnapshotCarousel({ pages, loading = false }: Props) {
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [pageIndex, setPageIndex] = useState(0);

  const pageCount = pages.length;
  const pageWidth = Math.max(
    1,
    windowWidth - WS.pageGutter * 2 - CARD_BORDER * 2,
  );
  const metricWidth = useMemo(() => {
    const rowWidth = pageWidth - CARD_PADDING * 2;
    return Math.max(
      56,
      Math.floor(
        (rowWidth - METRIC_GAP * (METRICS_PER_PAGE - 1)) / METRICS_PER_PAGE,
      ),
    );
  }, [pageWidth]);

  // Keep the retained page valid when the page set shrinks (e.g. manager → member).
  useEffect(() => {
    if (pageIndex <= pageCount - 1) return;
    const next = Math.max(0, pageCount - 1);
    setPageIndex(next);
    scrollX.setValue(next * pageWidth);
    scrollRef.current?.scrollTo({ x: next * pageWidth, animated: false });
  }, [pageCount, pageIndex, pageWidth, scrollX]);

  // Preserve the visible page across rotation / width changes.
  useEffect(() => {
    scrollX.setValue(pageIndex * pageWidth);
    scrollRef.current?.scrollTo({ x: pageIndex * pageWidth, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth]);

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPageIndex(Math.max(0, Math.min(pageCount - 1, next)));
  };

  if (pageCount === 0) return null;

  const multiPage = pageCount > 1;
  const activePage = pages[Math.min(pageIndex, pageCount - 1)];
  const activePageEmpty =
    !loading &&
    activePage.metrics.every(
      (metric) => metric.numericValue == null || metric.numericValue === 0,
    );

  return (
    <View style={CARD_STYLE} testID="workspace-snapshot-carousel">
      <View style={CARD_INNER_STYLE}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {activePage.title}
          </Text>
          <Text style={styles.stateLabel} numberOfLines={1}>
            {loading ? "Loading…" : activePageEmpty ? "No activity yet" : ""}
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={multiPage}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false },
          )}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onMomentumEnd}
          style={{ width: pageWidth }}
        >
          {pages.map((page) => (
            <View key={page.key} style={[styles.page, { width: pageWidth }]}>
              {page.metrics.map((metric) => (
                <SnapshotMetricCard
                  key={metric.key}
                  metric={metric}
                  width={metricWidth}
                  reduceMotion={reduceMotion}
                  loading={loading}
                />
              ))}
            </View>
          ))}
        </ScrollView>

        {multiPage ? (
          <PageDots count={pageCount} scrollX={scrollX} pageWidth={pageWidth} />
        ) : null}
      </View>
    </View>
  );
}

// The shadow lives on the outer view: iOS clips shadows on any view that also
// sets overflow: "hidden", which the paging ScrollView needs.
const CARD_STYLE: ViewStyle = {
  marginHorizontal: WS.pageGutter,
  marginTop: 6,
  marginBottom: 6,
  borderRadius: 16,
  backgroundColor: WS.surface,
  borderWidth: CARD_BORDER,
  borderColor: "#EDF1F6",
  shadowColor: "#0F172A",
  shadowOpacity: 0.035,
  shadowRadius: 7,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

const CARD_INNER_STYLE: ViewStyle = {
  borderRadius: 15,
  overflow: "hidden",
  paddingVertical: CARD_PADDING_VERTICAL,
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: CARD_PADDING,
    marginBottom: 2,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 9.5,
    lineHeight: 11,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: "#94A3B8",
  },
  stateLabel: {
    marginLeft: 8,
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: "600",
    color: "#A3ADBC",
  },
  page: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    minHeight: METRIC_ROW_MIN_HEIGHT,
    paddingHorizontal: CARD_PADDING,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 2,
  },
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: "#7C3AED",
  },
});
