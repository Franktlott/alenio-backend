import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ChevronRight,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Sparkles,
  Tag,
  UserPlus,
} from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { AcceptedConnectionEntry } from "@/lib/types";
import { colors } from "@/theme";

const BRAND = colors.brand;

export function NetworkDiscoverGrid({
  onDiscover,
  onByRole,
  onByInterest,
  onQuickConnect,
}: {
  onDiscover: () => void;
  onByRole: () => void;
  onByInterest: () => void;
  onQuickConnect: () => void;
}) {
  const tiles = [
    {
      key: "discover",
      title: "Discover People",
      body: "Find new connections",
      Icon: UserPlus,
      onPress: onDiscover,
    },
    {
      key: "role",
      title: "By Role",
      body: "Filter your directory",
      Icon: Layers,
      onPress: onByRole,
    },
    {
      key: "interest",
      title: "By Interest",
      body: "Browse suggestions",
      Icon: Tag,
      onPress: onByInterest,
    },
    {
      key: "quick",
      title: "Quick Connect",
      body: "Add by username",
      Icon: Sparkles,
      onPress: onQuickConnect,
    },
  ] as const;

  return (
    <View style={styles.discoverGrid} testID="network-discover-grid">
      {tiles.map(({ key, title, body, Icon, onPress }) => (
        <Pressable
          key={key}
          onPress={onPress}
          style={styles.discoverTile}
          accessibilityRole="button"
          accessibilityLabel={title}
          testID={`network-discover-${key}`}
        >
          <View style={styles.discoverIcon}>
            <Icon size={16} color={BRAND} strokeWidth={2.3} />
          </View>
          <View style={styles.discoverCopy}>
            <Text style={styles.discoverTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text
              style={styles.discoverBody}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {body}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function NetworkConnectionsSidebar({
  entries,
  total,
  messagingId,
  onOpen,
  onMessage,
  onMenu,
  onViewAll,
}: {
  entries: AcceptedConnectionEntry[];
  total: number;
  messagingId: string | null;
  onOpen: (userId: string) => void;
  onMessage: (entry: AcceptedConnectionEntry) => void;
  onMenu: (entry: AcceptedConnectionEntry) => void;
  onViewAll: () => void;
}) {
  return (
    <View style={styles.sidebarCard} testID="network-connections-sidebar">
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarTitle}>My Connections ({total})</Text>
        <Pressable
          onPress={onViewAll}
          hitSlop={8}
          style={styles.sidebarViewAll}
          accessibilityRole="button"
          accessibilityLabel="View all connections"
          testID="network-connections-view-all"
        >
          <Text style={styles.sidebarViewAllText}>View All</Text>
          <ChevronRight size={14} color={BRAND} strokeWidth={2.4} />
        </Pressable>
      </View>
      {entries.length === 0 ? (
        <Text style={styles.sidebarEmpty}>No connections yet</Text>
      ) : (
        entries.map((entry) => {
          const name = entry.person.name?.trim() || "Alenio member";
          const handle = entry.person.username?.trim()
            ? `@${entry.person.username.trim()}`
            : null;
          const title = entry.person.profileTitle?.trim() || null;
          // Prefer handle over title — titles were crowding out @usernames.
          const meta = handle ?? title ?? "Connection";
          return (
            <Pressable
              key={entry.id}
              onPress={() => onOpen(entry.person.id)}
              style={styles.sidebarRow}
              accessibilityRole="button"
              accessibilityLabel={`Open ${name}'s profile`}
              testID={`network-sidebar-connection-${entry.person.id}`}
            >
              <UserAvatar
                user={{ ...entry.person, activeNow: entry.activeNow }}
                size={40}
                radius={20}
                backgroundColor="#EEF2FF"
                textColor="#334155"
                fontSize={14}
              />
              <View style={styles.sidebarCopy}>
                <Text style={styles.sidebarName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.sidebarMeta} numberOfLines={1}>
                  {meta}
                </Text>
              </View>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onMessage(entry);
                }}
                disabled={messagingId === entry.person.id}
                hitSlop={6}
                style={styles.sidebarAction}
                accessibilityRole="button"
                accessibilityLabel={`Message ${name}`}
              >
                {messagingId === entry.person.id ? (
                  <ActivityIndicator size="small" color={BRAND} />
                ) : (
                  <MessageSquare size={16} color={BRAND} strokeWidth={2.3} />
                )}
              </Pressable>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onMenu(entry);
                }}
                hitSlop={6}
                style={styles.sidebarAction}
                accessibilityRole="button"
                accessibilityLabel={`More actions for ${name}`}
              >
                <MoreHorizontal size={16} color="#98A2B3" strokeWidth={2.3} />
              </Pressable>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  discoverGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  discoverTile: {
    width: "48%",
    flexGrow: 1,
    minWidth: 120,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    // No shadow — shadows tint the white gutters gray between tiles.
    shadowOpacity: 0,
    elevation: 0,
  },
  discoverIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
  },
  discoverCopy: { flex: 1, minWidth: 0 },
  discoverTitle: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  discoverBody: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  sidebarCard: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.06)",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 8,
  },
  sidebarTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  sidebarViewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sidebarViewAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: BRAND,
  },
  sidebarEmpty: {
    paddingVertical: 16,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
  sidebarRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  sidebarCopy: { flex: 1, minWidth: 0 },
  sidebarName: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sidebarMeta: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  sidebarAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
