import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { type LucideIcon } from "lucide-react-native";

export const MESSAGE_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

export type MessageAnchorLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MessageActionSheetAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
  hidden?: boolean;
  separatorBefore?: boolean;
};

type MessageActionSheetProps = {
  visible: boolean;
  layout: MessageAnchorLayout | null;
  alignRight?: boolean;
  onClose: () => void;
  myReaction?: string;
  onReaction: (emoji: string) => void;
  actions: MessageActionSheetAction[];
  children: React.ReactNode;
};

const ALENIO_GRADIENT = ["#EEF2FF", "#E0E7FF"] as const;
const REACTION_PILL_HEIGHT = 56;
const ACTION_CARD_WIDTH = 236;
const ACTION_ROW_MIN_HEIGHT = 48;
const ACTION_CARD_PADDING_V = 6;
const ACTION_SECTION_SEPARATOR = 9;
const STACK_GAP = 10;
const BUBBLE_TO_MENU_GAP = 14;
const EMOJI_HIT_WIDTH = 44;
const EDGE_PADDING = 20;

function ReactionEmoji({
  emoji,
  active,
  selected,
}: {
  emoji: string;
  active: boolean;
  selected: boolean;
}) {
  const scale = useSharedValue(selected ? 1.28 : 1);

  useEffect(() => {
    scale.value = withSpring(active ? 1.55 : selected ? 1.28 : 1, {
      damping: 14,
      stiffness: 340,
      mass: 0.5,
    });
  }, [active, scale, selected]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      style={[
        styles.emojiButton,
        selected ? styles.emojiButtonSelected : null,
        active ? styles.emojiButtonActive : null,
      ]}
    >
      <Animated.View style={[styles.emojiInner, animatedStyle]}>
        <Text style={[styles.emojiText, selected || active ? styles.emojiTextSelected : null]}>{emoji}</Text>
      </Animated.View>
    </View>
  );
}

function actionCardHeight(actions: MessageActionSheetAction[] = []) {
  const separatorCount = actions.filter((action) => action.separatorBefore).length;
  return (
    ACTION_CARD_PADDING_V * 2 +
    actions.length * ACTION_ROW_MIN_HEIGHT +
    separatorCount * ACTION_SECTION_SEPARATOR
  );
}

function computeAnchorPositions(
  layout: MessageAnchorLayout,
  bubbleHeight: number,
  screenWidth: number,
  screenHeight: number,
  insets: { top: number; bottom: number },
  reactionPillWidth: number,
  visibleActions: MessageActionSheetAction[],
  alignRight: boolean
) {
  const cardHeight = actionCardHeight(visibleActions);
  const stackHeight =
    REACTION_PILL_HEIGHT + STACK_GAP + bubbleHeight + BUBBLE_TO_MENU_GAP + cardHeight;

  let bubbleTop = layout.y;
  let reactionTop = bubbleTop - REACTION_PILL_HEIGHT - STACK_GAP;

  const minTop = insets.top + 8;
  const maxBottom = screenHeight - insets.bottom - 8;

  if (reactionTop < minTop) {
    const shift = minTop - reactionTop;
    bubbleTop += shift;
    reactionTop += shift;
  }

  if (bubbleTop + stackHeight - REACTION_PILL_HEIGHT - STACK_GAP > maxBottom) {
    const overflow = bubbleTop + stackHeight - REACTION_PILL_HEIGHT - STACK_GAP - maxBottom;
    bubbleTop -= overflow;
    reactionTop -= overflow;
  }

  if (reactionTop < minTop) {
    reactionTop = minTop;
    bubbleTop = reactionTop + REACTION_PILL_HEIGHT + STACK_GAP;
  }

  const bubbleLeft = Math.max(
    EDGE_PADDING,
    Math.min(layout.x, screenWidth - layout.width - EDGE_PADDING)
  );
  const reactionLeft = Math.max(
    EDGE_PADDING,
    Math.min(
      bubbleLeft + layout.width / 2 - reactionPillWidth / 2,
      screenWidth - reactionPillWidth - EDGE_PADDING
    )
  );
  const actionsTop = bubbleTop + bubbleHeight + BUBBLE_TO_MENU_GAP;
  const actionsLeft = alignRight
    ? Math.max(EDGE_PADDING, bubbleLeft + layout.width - ACTION_CARD_WIDTH)
    : Math.max(EDGE_PADDING, bubbleLeft);

  return {
    reactionTop,
    reactionLeft,
    bubbleTop,
    bubbleLeft,
    actionsTop,
    actionsLeft,
  };
}

type WindowRect = { x: number; y: number; width: number; height: number };

function pointInRect(pageX: number, pageY: number, rect: WindowRect) {
  return (
    pageX >= rect.x &&
    pageX <= rect.x + rect.width &&
    pageY >= rect.y &&
    pageY <= rect.y + rect.height
  );
}

export function MessageActionSheet({
  visible,
  layout,
  alignRight = false,
  onClose,
  myReaction,
  onReaction,
  actions,
  children,
}: MessageActionSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const reactionPillWidth = Math.min(screenWidth - 16, 300);
  const visibleActions = (actions ?? []).filter((action) => !action.hidden);
  const lastHoveredRef = useRef<string | null>(null);
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null);
  const [renderedBubbleHeight, setRenderedBubbleHeight] = useState<number | null>(null);

  const bubbleHeight = Math.max(layout?.height ?? 0, renderedBubbleHeight ?? 0);

  const positions = useMemo(() => {
    if (!layout || layout.width <= 0 || bubbleHeight <= 0) return null;
    return computeAnchorPositions(
      layout,
      bubbleHeight,
      screenWidth,
      screenHeight,
      insets,
      reactionPillWidth,
      visibleActions,
      alignRight
    );
  }, [
    alignRight,
    bubbleHeight,
    insets,
    layout,
    reactionPillWidth,
    screenHeight,
    screenWidth,
    visibleActions,
  ]);

  useEffect(() => {
    if (!visible) {
      setHoveredEmoji(null);
      setRenderedBubbleHeight(null);
      lastHoveredRef.current = null;
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    setHoveredEmoji(null);
    lastHoveredRef.current = null;
    onClose();
  }, [onClose]);

  const handleReaction = useCallback(
    (emoji: string) => {
      // Backend toggles off when the same emoji is tapped again, or swaps to a new one.
      onReaction(emoji);
      handleClose();
    },
    [handleClose, onReaction]
  );

  const handleBackdropPress = useCallback(
    (event: GestureResponderEvent) => {
      if (!positions) return;

      const { pageX, pageY } = event.nativeEvent;
      const pillRect: WindowRect = {
        x: positions.reactionLeft,
        y: positions.reactionTop,
        width: reactionPillWidth,
        height: REACTION_PILL_HEIGHT,
      };
      const actionRect: WindowRect = {
        x: positions.actionsLeft,
        y: positions.actionsTop,
        width: ACTION_CARD_WIDTH,
        height: actionCardHeight(visibleActions),
      };

      if (pointInRect(pageX, pageY, pillRect)) return;
      if (visibleActions.length > 0 && pointInRect(pageX, pageY, actionRect)) return;
      handleClose();
    },
    [handleClose, positions, reactionPillWidth, visibleActions.length]
  );

  if (!visible || !layout || !positions) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.root, { width: screenWidth, height: screenHeight }]}
        onPress={handleBackdropPress}
        accessibilityRole="button"
        accessibilityLabel="Close message menu"
      >
        <LinearGradient
          pointerEvents="none"
          colors={[...ALENIO_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
          <View
            collapsable={false}
            style={[
              styles.reactionPill,
              {
                top: positions.reactionTop,
                left: positions.reactionLeft,
                width: reactionPillWidth,
              },
            ]}
          >
            {MESSAGE_REACTION_EMOJIS.map((emoji) => {
              const selected = emoji === myReaction;
              const active = emoji === hoveredEmoji;
              return (
                <Pressable
                  key={emoji}
                  onPress={() => handleReaction(emoji)}
                  onHoverIn={() => {
                    setHoveredEmoji(emoji);
                    lastHoveredRef.current = emoji;
                  }}
                  onHoverOut={() => {
                    setHoveredEmoji((current) => (current === emoji ? null : current));
                    if (lastHoveredRef.current === emoji) {
                      lastHoveredRef.current = null;
                    }
                  }}
                  onPressIn={() => {
                    setHoveredEmoji(emoji);
                    lastHoveredRef.current = emoji;
                    void Haptics.selectionAsync();
                  }}
                  onPressOut={() => {
                    setHoveredEmoji((current) => (current === emoji ? null : current));
                    if (lastHoveredRef.current === emoji) {
                      lastHoveredRef.current = null;
                    }
                  }}
                  style={[styles.emojiPressable, active ? styles.emojiPressableActive : null]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={
                    selected
                      ? `${emoji} reaction selected. Tap to remove or choose another reaction.`
                      : `React with ${emoji}`
                  }
                  accessibilityState={{ selected }}
                >
                  <ReactionEmoji emoji={emoji} active={active} selected={selected} />
                </Pressable>
              );
            })}
          </View>

          <View
            pointerEvents="none"
            onLayout={(event) => {
              const height = event.nativeEvent.layout.height;
              if (height > 0) {
                setRenderedBubbleHeight((current) => (current === height ? current : height));
              }
            }}
            style={{
              position: "absolute",
              top: positions.bubbleTop,
              left: positions.bubbleLeft,
              width: layout.width,
            }}
          >
            {children}
          </View>

          {visibleActions.length > 0 ? (
            <View
              style={[
                styles.actionCard,
                {
                  top: positions.actionsTop,
                  left: positions.actionsLeft,
                  width: ACTION_CARD_WIDTH,
                },
              ]}
            >
              <View style={styles.actionCardInner}>
                {visibleActions.map((action, index) => {
                  const Icon = action.icon;
                  const destructive = action.destructive;
                  const isLast = index === visibleActions.length - 1;
                  return (
                    <View key={action.id}>
                      {action.separatorBefore ? <View style={styles.actionSectionDivider} /> : null}
                      <Pressable
                        onPress={() => {
                          action.onPress();
                          handleClose();
                        }}
                        style={({ pressed }) => [
                          styles.actionRowPressable,
                          pressed ? styles.actionRowPressed : null,
                        ]}
                      >
                        <View style={styles.actionRow}>
                          <Text
                            style={[styles.actionLabel, destructive ? styles.actionLabelDestructive : null]}
                            numberOfLines={1}
                          >
                            {action.label}
                          </Text>
                          <View style={styles.actionIconWrap}>
                            <Icon
                              size={17}
                              color={destructive ? "#DC2626" : "#64748B"}
                              strokeWidth={2.25}
                            />
                          </View>
                        </View>
                      </Pressable>
                      {!isLast && !visibleActions[index + 1]?.separatorBefore ? (
                        <View style={styles.actionRowDivider} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#EEF2FF",
  },
  reactionPill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "visible",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    zIndex: 3,
  },
  emojiPressable: {
    borderRadius: 22,
    overflow: "visible",
    zIndex: 1,
  },
  emojiPressableActive: {
    zIndex: 4,
  },
  emojiButton: {
    width: EMOJI_HIT_WIDTH,
    height: REACTION_PILL_HEIGHT - 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  emojiButtonSelected: {
    backgroundColor: "rgba(67, 97, 238, 0.14)",
    borderRadius: 22,
  },
  emojiButtonActive: {
    backgroundColor: "rgba(67, 97, 238, 0.1)",
    borderRadius: 22,
  },
  emojiInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: {
    fontSize: 24,
  },
  emojiTextSelected: {
    fontSize: 28,
  },
  actionCard: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.08)",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    zIndex: 5,
  },
  actionCardInner: {
    width: "100%",
    paddingVertical: ACTION_CARD_PADDING_V,
  },
  actionSectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
    marginTop: 4,
    marginBottom: 4,
    marginHorizontal: 18,
  },
  actionRowPressable: {
    width: "100%",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: ACTION_ROW_MIN_HEIGHT,
    paddingHorizontal: 18,
  },
  actionIconWrap: {
    width: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  actionRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 18,
  },
  actionRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  actionLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1E293B",
    letterSpacing: 0.1,
    textAlign: "left",
  },
  actionLabelDestructive: {
    color: "#DC2626",
  },
});
