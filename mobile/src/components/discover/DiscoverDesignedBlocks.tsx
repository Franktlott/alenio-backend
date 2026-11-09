import { StyleSheet, Text, View } from "react-native";
import {
  BookOpen,
  Check,
  Clock,
  Compass,
  Heart,
  Lightbulb,
  MessageCircle,
  Rocket,
  Shield,
  Smile,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react-native";

/** Same names the web content studio stores in the article. */
const ICONS: Record<string, LucideIcon> = {
  users: Users,
  target: Target,
  zap: Zap,
  heart: Heart,
  rocket: Rocket,
  star: Star,
  lightbulb: Lightbulb,
  shield: Shield,
  message: MessageCircle,
  compass: Compass,
  trophy: Trophy,
  sparkles: Sparkles,
  check: Check,
  clock: Clock,
  book: BookOpen,
  smile: Smile,
};

const TONES: Record<string, { fg: string; bg: string; border: string }> = {
  purple: { fg: "#6D28D9", bg: "#F1ECFF", border: "#E4DCFD" },
  blue: { fg: "#2563EB", bg: "#E8F0FE", border: "#D6E4FD" },
  green: { fg: "#15803D", bg: "#E7F8EE", border: "#CDEEDB" },
  orange: { fg: "#C2410C", bg: "#FFF1E6", border: "#FDE0C8" },
  pink: { fg: "#BE185D", bg: "#FDEEF5", border: "#FBD5E6" },
  teal: { fg: "#0F766E", bg: "#E6F7F5", border: "#C9ECE7" },
};

type Attrs = Record<string, unknown>;
type Card = { icon?: string; tone?: string; kicker?: string; title?: string; text?: string };

const str = (value: unknown) => (typeof value === "string" ? value : "");
const tone = (value: unknown) => TONES[str(value)] ?? TONES.purple!;
const icon = (value: unknown) => ICONS[str(value)] ?? Sparkles;

function IconTile({ name, color, large }: { name: unknown; color: ReturnType<typeof tone>; large?: boolean }) {
  const Icon = icon(name);
  return (
    <View
      style={[
        styles.tile,
        large
          ? { width: 46, height: 46, borderRadius: 13, backgroundColor: color.bg }
          : { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: color.border },
      ]}
    >
      <Icon size={large ? 22 : 18} color={color.fg} strokeWidth={2.2} />
    </View>
  );
}

export function DiscoverCallout({ attrs }: { attrs: Attrs }) {
  const color = tone(attrs.tone);
  const title = str(attrs.title);
  const text = str(attrs.text);
  return (
    <View style={[styles.panel, { backgroundColor: color.bg, borderColor: color.border, flexDirection: "row", gap: 14 }]}>
      <IconTile name={attrs.icon} color={color} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={[styles.calloutTitle, { color: color.fg }]}>{title}</Text> : null}
        {text ? <Text style={styles.panelText}>{text}</Text> : null}
      </View>
    </View>
  );
}

export function DiscoverCardGrid({ attrs }: { attrs: Attrs }) {
  const cards = (Array.isArray(attrs.cards) ? attrs.cards : []) as Card[];
  const single = cards.length === 1;
  return (
    <View style={styles.grid}>
      {cards.map((card, index) => {
        const color = tone(card.tone);
        return (
          <View key={index} style={[styles.card, single ? { width: "100%" } : null]}>
            <IconTile name={card.icon} color={color} large />
            {card.kicker ? <Text style={[styles.kicker, { color: color.fg }]}>{card.kicker}</Text> : null}
            {card.title ? <Text style={styles.cardTitle}>{card.title}</Text> : null}
            {card.text ? <Text style={styles.cardText}>{card.text}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

export function DiscoverChecklist({ attrs }: { attrs: Attrs }) {
  const color = tone(attrs.tone);
  const title = str(attrs.title);
  const items = (Array.isArray(attrs.items) ? attrs.items : []).map(str).filter((item) => item.trim());
  return (
    <View style={[styles.panel, { backgroundColor: color.bg, borderColor: color.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconTile name={attrs.icon} color={color} />
        {title ? <Text style={[styles.checklistTitle, { flex: 1 }]}>{title}</Text> : null}
      </View>
      {items.map((item, index) => (
        <View key={index} style={styles.checkRow}>
          <View style={[styles.check, { backgroundColor: color.fg }]}>
            <Check size={11} color="#FFFFFF" strokeWidth={3} />
          </View>
          <Text style={[styles.panelText, { flex: 1, marginTop: 0 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  panel: { marginVertical: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  calloutTitle: { fontSize: 15, lineHeight: 21, fontWeight: "800" },
  panelText: { marginTop: 3, fontSize: 15, lineHeight: 22, color: "#344054" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10, marginVertical: 14 },
  card: {
    width: "48.5%",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ECEAF3",
    backgroundColor: "#FFFFFF",
  },
  kicker: { marginTop: 10, fontSize: 26, lineHeight: 30, fontWeight: "800" },
  cardTitle: { marginTop: 4, fontSize: 15, lineHeight: 20, fontWeight: "800", color: "#0F172A", textAlign: "center" },
  cardText: { marginTop: 6, fontSize: 13, lineHeight: 19, color: "#475467", textAlign: "center" },
  checklistTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800", color: "#0F172A" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 10 },
  check: { width: 19, height: 19, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
});
