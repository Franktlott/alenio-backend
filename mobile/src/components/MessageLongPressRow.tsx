import React, { useCallback, useRef, isValidElement, cloneElement } from "react";
import { View, useWindowDimensions } from "react-native";
import * as Haptics from "expo-haptics";
import type { MessageAnchorLayout } from "@/components/MessageActionSheet";

type MeasurableChildProps = {
  bubbleRef?: React.RefObject<View | null>;
  onLongPress?: () => void;
};

type MessageLongPressRowProps = {
  alignRight?: boolean;
  onOpenMenu: (layout: MessageAnchorLayout) => void;
  children: React.ReactElement<MeasurableChildProps>;
};

export function MessageLongPressRow({ alignRight = false, onOpenMenu, children }: MessageLongPressRowProps) {
  const bubbleRef = useRef<View>(null);
  const rowRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const handleLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const fallbackWidth = Math.min(Math.round(screenWidth * 0.62), screenWidth - 48);
    const fallbackLayout: MessageAnchorLayout = {
      x: alignRight ? screenWidth - fallbackWidth - 24 : 56,
      y: Math.max(120, screenHeight * 0.38),
      width: fallbackWidth,
      height: 52,
    };

    let delivered = false;
    const deliver = (layout: MessageAnchorLayout) => {
      if (delivered) return;
      delivered = true;
      onOpenMenu(layout);
    };

    const measure = (target: View | null, next: () => void) => {
      target?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          deliver({ x, y, width, height });
        } else {
          next();
        }
      });
    };

    requestAnimationFrame(() => {
      measure(bubbleRef.current, () => {
        measure(rowRef.current, () => deliver(fallbackLayout));
      });
    });

    setTimeout(() => deliver(fallbackLayout), 80);
  }, [alignRight, onOpenMenu, screenHeight, screenWidth]);

  const child = isValidElement(children)
    ? cloneElement(children, { bubbleRef, onLongPress: handleLongPress })
    : children;

  return (
    <View ref={rowRef} collapsable={false}>
      {child}
    </View>
  );
}
