import { View, Text, Pressable, Image } from "react-native";
import { CalendarPlus } from "lucide-react-native";
import { colors, radii, space } from "@/theme";
import { WS } from "./workspace-ui";

type Props = {
  dayLabel?: string;
  onAdd?: () => void;
};

/** Centered empty for a selected calendar day with a clear CTA. */
export function CalendarDayEmptyState({ dayLabel, onAdd }: Props) {
  return (
    <View
      style={{
        flex: 1,
        alignSelf: "stretch",
        width: "100%",
        minHeight: 0,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.lg,
        paddingVertical: space.xl,
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.borderCard,
      }}
      testID="calendar-day-empty-state"
    >
      <Image
        source={require("@/assets/alenio-empty-calendar.png")}
        style={{
          width: 132,
          height: 132,
          marginBottom: 2,
        }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: WS.ink,
          textAlign: "center",
          letterSpacing: -0.2,
          marginBottom: 4,
        }}
      >
        Nothing scheduled
      </Text>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "500",
          color: WS.muted,
          textAlign: "center",
          lineHeight: 17,
          maxWidth: 260,
          marginBottom: onAdd ? 14 : 0,
        }}
      >
        {dayLabel
          ? `No events or tasks on ${dayLabel}. Add something to fill this day.`
          : "No events or tasks for this day. Add something to get started."}
      </Text>

      {onAdd ? (
        <Pressable
          onPress={onAdd}
          testID="calendar-day-empty-add"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: colors.brand,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: radii.card,
            minHeight: 40,
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <CalendarPlus size={15} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>
            Add to this day
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
