import { useCallback, useEffect, useRef } from "react";
import type { FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

export function useChatListScroll(resetKey: string, itemCount: number) {
  const listRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  const shouldStickToBottomRef = useRef(true);
  const needsInitialScrollRef = useRef(true);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    isNearBottomRef.current = true;
    needsInitialScrollRef.current = true;
    contentHeightRef.current = 0;
    layoutHeightRef.current = 0;
  }, [resetKey]);

  const scrollToBottom = useCallback(
    (animated = false) => {
      if (itemCount <= 0 || !listRef.current) return;
      const lastIndex = itemCount - 1;
      const maxOffset = Math.max(0, contentHeightRef.current - layoutHeightRef.current);

      if (maxOffset > 0) {
        listRef.current.scrollToOffset({ offset: maxOffset, animated });
      }
      listRef.current.scrollToIndex({ index: lastIndex, animated, viewPosition: 1 });
    },
    [itemCount],
  );

  const tryScrollToBottom = useCallback(
    (animated = false) => {
      if (!shouldStickToBottomRef.current && !needsInitialScrollRef.current) return;
      if (layoutHeightRef.current <= 0 || contentHeightRef.current <= 0) return;
      scrollToBottom(animated);
    },
    [scrollToBottom],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isNearBottomRef.current = distanceFromBottom < 100;
    if (distanceFromBottom < 80) {
      needsInitialScrollRef.current = false;
    }
    if (!isNearBottomRef.current) {
      shouldStickToBottomRef.current = false;
    }
  }, []);

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      tryScrollToBottom(false);
    },
    [tryScrollToBottom],
  );

  const handleListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      layoutHeightRef.current = event.nativeEvent.layout.height;
      tryScrollToBottom(false);
    },
    [tryScrollToBottom],
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number; highestMeasuredFrameIndex: number }) => {
      const estimatedOffset = Math.max(0, info.averageItemLength * info.index);
      listRef.current?.scrollToOffset({ offset: estimatedOffset, animated: false });
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 1 });
      });
    },
    [],
  );

  const followLatestIfNearBottom = useCallback(
    (animated = true) => {
      if (shouldStickToBottomRef.current || isNearBottomRef.current) {
        scrollToBottom(animated);
      }
    },
    [scrollToBottom],
  );

  const initialScrollIndex = itemCount > 0 ? itemCount - 1 : undefined;

  return {
    listRef,
    handleScroll,
    handleContentSizeChange,
    handleListLayout,
    handleScrollToIndexFailed,
    followLatestIfNearBottom,
    initialScrollIndex,
  };
}
