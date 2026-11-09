import { useEffect, useRef, type ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";

/** Springs the check once, when a task flips from open to done. */
export function CheckBurst({
  checked,
  enter = false,
  style,
  children,
}: {
  checked: boolean;
  /** Play as soon as this check appears, such as the mark on a row that just finished. */
  enter?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const scale = useRef(new Animated.Value(enter ? 0.35 : 1)).current;
  const wasChecked = useRef(checked);
  const entered = useRef(false);

  useEffect(() => {
    const flipped = checked && !wasChecked.current;
    if ((enter && !entered.current) || flipped) {
      entered.current = true;
      scale.setValue(0.35);
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 180,
        useNativeDriver: true,
      }).start();
    }
    wasChecked.current = checked;
  }, [checked, enter, scale]);

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}
