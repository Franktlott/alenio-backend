import type { ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { tones, type Tone } from "@/theme";

export type BadgeTone = Tone;

/** Mirrors web `Badge`: small status pill in one of the shared tones. */
export function Badge({
  tone = "neutral",
  dot = false,
  icon,
  uppercase = false,
  size = "md",
  children,
  style,
}: {
  /** `sm` fits inside list rows. */
  size?: "sm" | "md";
  tone?: BadgeTone;
  dot?: boolean;
  icon?: ReactNode;
  uppercase?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];
  const sm = size === "sm";
  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: sm ? 4 : 5,
          height: sm ? 19 : 22,
          paddingHorizontal: sm ? 6 : 8,
          borderRadius: sm ? 6 : 7,
          backgroundColor: t.bg,
        },
        style,
      ]}
    >
      {dot ? <View style={{ width: sm ? 5 : 6, height: sm ? 5 : 6, borderRadius: 3, backgroundColor: t.dot }} /> : null}
      {icon}
      <Text
        numberOfLines={1}
        style={{
          color: t.fg,
          fontSize: sm ? 10 : uppercase ? 10.5 : 11.5,
          fontWeight: uppercase ? "800" : "700",
          letterSpacing: uppercase ? 0.6 : 0,
          textTransform: uppercase ? "uppercase" : "none",
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export type StatusKind = "open" | "done" | "overdue" | "soon";

const STATUS: Record<StatusKind, { tone: BadgeTone; label: string }> = {
  open: { tone: "neutral", label: "Open" },
  done: { tone: "success", label: "Completed" },
  overdue: { tone: "danger", label: "Overdue" },
  soon: { tone: "warning", label: "Due soon" },
};

export function StatusBadge({ status }: { status: StatusKind }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

const PRIORITY_TONE: Record<string, BadgeTone> = {
  urgent: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

/** Mirrors web `PriorityBadge`, so a High task reads the same everywhere. */
export function PriorityBadge({
  priority,
  label,
  faded = false,
  style,
}: {
  priority: string;
  label: string;
  faded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Badge
      tone={faded ? "neutral" : (PRIORITY_TONE[priority] ?? "neutral")}
      dot={!faded}
      size="sm"
      style={style}
    >
      {label}
    </Badge>
  );
}
