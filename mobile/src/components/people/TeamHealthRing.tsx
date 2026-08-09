import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type Props = {
  /** 0-100, or null when there is not enough data yet. */
  value: number | null;
  color: string;
  size?: number;
  strokeWidth?: number;
};

export function TeamHealthRing({ value, color, size = 96, strokeWidth = 9 }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const filled = (pct / 100) * circumference;

  return (
    <View style={{ width: size, height: size }} testID="team-health-ring">
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#EEF2F7"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {value == null ? null : (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            fill="none"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: "#0F172A", letterSpacing: -0.6 }}>
          {value == null ? "—" : `${Math.round(value)}%`}
        </Text>
      </View>
    </View>
  );
}
