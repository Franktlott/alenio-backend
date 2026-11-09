import { Fragment, useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { WS } from "@/components/workspace/workspace-ui";
import {
  SnapshotMetricCard,
  useReduceMotion,
} from "@/components/workspace/snapshot/SnapshotMetricCard";
import {
  SNAPSHOT_CARD_TITLE,
  type SnapshotPage,
} from "@/components/workspace/snapshot/snapshot-types";
import {
  useAdaptiveLayout,
  useStatusClusterInset,
} from "@/lib/adaptive-layout";

const CARD_PADDING = 14;
const CARD_PADDING_VERTICAL = 7;
const CARD_BORDER = 1;
const METRIC_GAP = 5;
/** Four member metrics need the extra points more than the breathing room. */
const METRIC_GAP_TIGHT = 3;
const DIVIDER_WIDTH = 1;
const DOT_SIZE = 4;
const DOT_ACTIVE_WIDTH = 12;
/**
 * Narrowest a metric can be and still fit its longest label ("Needs Action")
 * on one line. Once every metric clears this, the pages collapse into a single
 * evenly divided row and there is nothing left to swipe.
 */
const UNIFIED_MIN_METRIC_WIDTH = 78;
/**
 * Whitespace where the counts hand over to the Alenio Go modules. Wider than
 * the metric gap and without a divider, so the two groups read as parts of one
 * row rather than as two separate strips.
 */
const GROUP_GAP = 26;

type Props = {
  pages: SnapshotPage[];
  loading?: boolean;
};

function metricGapForCount(count: number) {
  return count > 3 ? METRIC_GAP_TIGHT : METRIC_GAP;
}

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
  const { columnWidth } = useAdaptiveLayout();
  const cluster = useStatusClusterInset();
  const cardStyle = [
    CARD_STYLE,
    {
      marginLeft: WS.pageGutter + cluster.left,
      marginRight: WS.pageGutter + cluster.right,
    },
  ];
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [pageIndex, setPageIndex] = useState(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const pageCount = pages.length;
  /**
   * Derived from the window only until the card reports its own frame: a rail
   * or a pane inset means the window width overstates the room we have, and
   * sizing rows against it pushes the last metric under the card's clip.
   */
  const pageWidth = Math.max(
    1,
    measuredWidth || columnWidth - WS.pageGutter * 2 - CARD_BORDER * 2,
  );

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

  /** Keeps the card's left edge on the same line as the feed below it. */
  const columnStyle: ViewStyle = {
    alignSelf: "center",
    width: "100%",
    maxWidth: columnWidth,
  };
  const multiPage = pageCount > 1;
  const onCardLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    setMeasuredWidth((current) => (current === next ? current : next));
  };
  const headerFor = (title: string) => (
    <View style={styles.headerRow}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );

  /**
   * Wide enough for every metric at a readable width: the pages become one
   * evenly divided row, so nothing is a swipe away.
   */
  const allMetrics = pages.flatMap((page, pageIdx) =>
    page.metrics.map((metric, index) => ({
      metric,
      startsGroup: pageIdx > 0 && index === 0,
    })),
  );
  const unifiedGap = metricGapForCount(allMetrics.length);
  const groupBreaks = pageCount - 1;
  const dividerCount = allMetrics.length - 1 - groupBreaks;
  const betweenMetrics =
    dividerCount * (unifiedGap * 2 + DIVIDER_WIDTH) + groupBreaks * GROUP_GAP;
  /**
   * Only decides whether one row is worth it. The cells themselves take an
   * equal flex share of the real row, so their spacing never depends on this
   * estimate being right.
   */
  const estimatedMetricWidth = Math.floor(
    (pageWidth - CARD_PADDING * 2 - betweenMetrics) / allMetrics.length,
  );

  if (multiPage && estimatedMetricWidth >= UNIFIED_MIN_METRIC_WIDTH) {
    /**
     * Mirrors the metric row's sizing so each title sits over its own group:
     * the fixed basis covers the dividers inside the group, and the grow share
     * matches the cells those dividers separate.
     */
    const groupHeaderStyle = (count: number): ViewStyle => ({
      flexDirection: "row",
      flexBasis: (count - 1) * (unifiedGap * 2 + DIVIDER_WIDTH),
      flexGrow: count,
      flexShrink: 1,
      minWidth: 0,
    });
    return (
      <View style={columnStyle}>
        <View style={cardStyle} testID="workspace-snapshot-carousel">
          <View style={CARD_INNER_STYLE} onLayout={onCardLayout}>
            <View style={styles.headerGroupRow}>
              {pages.map((page, index) => (
                <Fragment key={page.key}>
                  {index === 0 ? null : <View style={styles.groupGap} />}
                  <View style={groupHeaderStyle(page.metrics.length)}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                      {page.title}
                    </Text>
                  </View>
                </Fragment>
              ))}
            </View>
            <View
              style={styles.unifiedRow}
              testID="workspace-snapshot-unified-row"
            >
              {allMetrics.map(({ metric, startsGroup }, index) => (
                <Fragment key={metric.key}>
                  {index === 0 ? null : startsGroup ? (
                    <View style={styles.groupGap} />
                  ) : (
                    <View
                      style={[styles.divider, { marginHorizontal: unifiedGap }]}
                    />
                  )}
                  <View style={styles.unifiedCell}>
                    <SnapshotMetricCard
                      metric={metric}
                      reduceMotion={reduceMotion}
                      loading={loading}
                    />
                  </View>
                </Fragment>
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={columnStyle}>
      <View style={cardStyle} testID="workspace-snapshot-carousel">
        <View style={CARD_INNER_STYLE} onLayout={onCardLayout}>
          {headerFor(
            multiPage
              ? (pages[pageIndex]?.title ?? SNAPSHOT_CARD_TITLE)
              : SNAPSHOT_CARD_TITLE,
          )}

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
                {page.metrics.map((metric, index) => (
                  <Fragment key={metric.key}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.unifiedCell}>
                      <SnapshotMetricCard
                        metric={metric}
                        reduceMotion={reduceMotion}
                        loading={loading}
                      />
                    </View>
                  </Fragment>
                ))}
              </View>
            ))}
          </ScrollView>

          {multiPage ? (
            <PageDots
              count={pageCount}
              scrollX={scrollX}
              pageWidth={pageWidth}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

// The shadow lives on the outer view: iOS clips shadows on any view that also
// sets overflow: "hidden", which the paging ScrollView needs.
const CARD_STYLE: ViewStyle = {
  marginTop: 6,
  marginBottom: 6,
  borderRadius: 18,
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
  borderRadius: 17,
  overflow: "hidden",
  paddingVertical: CARD_PADDING_VERTICAL,
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    paddingHorizontal: CARD_PADDING,
    marginBottom: 3,
    gap: 10,
  },
  /** No gap: the group widths alone have to line the titles up with the row. */
  headerGroupRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    paddingHorizontal: CARD_PADDING,
    marginBottom: 3,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#94A3B8",
  },
  /**
   * Exactly what a cell occupies: the 26pt icon slot, 2pt, and a 14pt label.
   * Anything larger is padding the row cannot use.
   */
  page: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 42,
    paddingHorizontal: CARD_PADDING,
  },
  unifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 42,
    paddingHorizontal: CARD_PADDING,
  },
  /**
   * Equal shares of whatever the row actually is, so the cells stay evenly
   * spaced and can never add up to more than the card can show.
   */
  unifiedCell: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  groupGap: {
    width: GROUP_GAP,
  },
  divider: {
    width: DIVIDER_WIDTH,
    height: 32,
    borderRadius: DIVIDER_WIDTH / 2,
    backgroundColor: "#EDF1F6",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
  },
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: "#7C3AED",
  },
});
