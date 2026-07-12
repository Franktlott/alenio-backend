import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";

const NEAR_LATEST_PX = 120;

/**
 * Messenger-style inverted chat list.
 * Pass messages newest-first with FlatList `inverted={true}`.
 * The list lives in a clipped flex region above the composer, so rows never draw under the footer.
 *
 * Inverted padding: paddingTop = space above the composer (visual bottom).
 *
 * `autoscrollToTopThreshold` is required with inverted lists: without it,
 * maintainVisibleContentPosition keeps older rows pinned and new messages
 * land under the composer instead of shifting the thread up.
 */
export function useChatListScroll(resetKey: string, _itemCount: number) {
  const listRef = useRef<FlatList>(null);
  const stickToLatestRef = useRef(true);
  const pendingScrollIndexRef = useRef<number | null>(null);

  useEffect(() => {
    stickToLatestRef.current = true;
    pendingScrollIndexRef.current = null;
  }, [resetKey]);

  const scrollToLatest = useCallback((animated = false) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollToOffset({ offset: 0, animated });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    stickToLatestRef.current = event.nativeEvent.contentOffset.y < NEAR_LATEST_PX;
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (stickToLatestRef.current) {
      scrollToLatest(false);
    }
  }, [scrollToLatest]);

  const followLatestIfNearBottom = useCallback(
    (animated = true) => {
      if (!stickToLatestRef.current) return;
      scrollToLatest(animated);
      requestAnimationFrame(() => {
        scrollToLatest(false);
        requestAnimationFrame(() => scrollToLatest(false));
      });
    },
    [scrollToLatest],
  );

  const scrollToIndex = useCallback((index: number, animated = true) => {
    const list = listRef.current;
    if (!list || index < 0) return false;
    stickToLatestRef.current = false;
    pendingScrollIndexRef.current = index;
    try {
      list.scrollToIndex({ index, animated, viewPosition: 0.35 });
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      const list = listRef.current;
      if (!list) return;
      const approx = Math.max(1, info.averageItemLength || 120);
      list.scrollToOffset({
        offset: Math.max(0, info.index * approx),
        animated: false,
      });
      const target = pendingScrollIndexRef.current ?? info.index;
      setTimeout(() => {
        try {
          listRef.current?.scrollToIndex({ index: target, animated: true, viewPosition: 0.35 });
        } catch {
          // Layout still settling; ignore.
        }
      }, 80);
    },
    [],
  );

  const contentContainerStyle: StyleProp<ViewStyle> = {
    flexGrow: 1,
    // Inverted: paddingTop clears space above the composer so the newest row is never clipped.
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 12,
  };

  const maintainVisibleContentPosition = useMemo(
    () => ({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: NEAR_LATEST_PX,
    }),
    [],
  );

  return {
    listRef,
    handleScroll,
    handleContentSizeChange,
    followLatestIfNearBottom,
    scrollToIndex,
    handleScrollToIndexFailed,
    contentContainerStyle,
    maintainVisibleContentPosition,
    readyForOlderLoad: true,
  };
}
