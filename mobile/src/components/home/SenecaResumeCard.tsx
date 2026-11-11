import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowUpRight, ChevronRight, MessageSquare } from "lucide-react-native";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";
import { elevation, palette, tints } from "@/theme";

export type SenecaResumeConversation = {
  id: string;
  title: string;
  whenLabel: string;
};

type Props = {
  conversations: SenecaResumeConversation[];
  onOpen: (id: string) => void;
  onContinue: () => void;
  testID?: string;
};

/**
 * One Home card: "Pick up where you left off", with every recent Seneca
 * conversation listed inside it.
 */
export function SenecaResumeCard({
  conversations,
  onOpen,
  onContinue,
  testID,
}: Props) {
  if (conversations.length === 0) return null;
  return (
    <View style={styles.card} testID={testID ?? "home-seneca-resume"}>
      <Pressable
        onPress={onContinue}
        accessibilityRole="button"
        accessibilityLabel="Continue with Seneca"
      >
        <View style={styles.header}>
          <SenecaIcon size={27} />
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Pick up where you left off</Text>
            <Text style={styles.headerSubtitle}>Continue with Seneca</Text>
          </View>
          <ArrowUpRight size={18} color="#98A2B3" strokeWidth={2.2} />
        </View>
      </Pressable>
      <View style={styles.list}>
        {conversations.map((conversation) => (
          <Pressable
            key={conversation.id}
            onPress={() => onOpen(conversation.id)}
            accessibilityRole="button"
            accessibilityLabel={`${conversation.title}, your recent conversation, ${conversation.whenLabel}`}
            testID={`home-seneca-resume-${conversation.id}`}
          >
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <MessageSquare size={16} color={tints.lavender.fg} strokeWidth={2.2} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {conversation.title}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  Your recent conversation · {conversation.whenLabel}
                </Text>
              </View>
              <ChevronRight size={17} color="#C4B5FD" strokeWidth={2.3} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...elevation.card,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 4,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111A2B",
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.rowDivider,
    backgroundColor: "#FAF9FE",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tints.lavender.bg,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: "700",
    color: "#111A2B",
  },
  rowSubtitle: {
    marginTop: 1,
    fontSize: 11.5,
    lineHeight: 15,
    color: "#667085",
  },
});
