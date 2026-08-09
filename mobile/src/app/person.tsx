import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Building2,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Globe2,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Trophy,
  Target,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { resolveUserImageUrl } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import type {
  ConnectionStatus,
  PublicPersonProfile,
  PublicProfileWorkspace,
} from "@/lib/types";
import { WorkspaceTeamAvatar, formatTeamRole } from "@/components/WorkspaceTeamUI";

const BRAND = "#4361EE";
const PAGE_BG = "#FFFFFF";

export default function PersonScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === "string" ? params.userId : "";
  const [menuOpen, setMenuOpen] = useState(false);
  const personKey = ["person", userId] as const;

  const { data: person, isLoading } = useQuery({
    queryKey: personKey,
    queryFn: () =>
      api.get<PublicPersonProfile>(`/api/connections/person/${encodeURIComponent(userId)}`),
    enabled: userId.length > 0,
  });

  const refreshPerson = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: personKey }),
      queryClient.invalidateQueries({ queryKey: ["connections"] }),
      queryClient.invalidateQueries({ queryKey: ["connection-suggestions"] }),
      queryClient.invalidateQueries({ queryKey: ["user-search"] }),
    ]);
  };

  const connectionAction = useMutation({
    mutationFn: (action: "request" | "accept" | "decline" | "remove" | "block") => {
      if (action === "remove") return api.delete("/api/connections", { userId });
      if (action === "block") return api.post("/api/connections/block", { userId });
      return api.post(`/api/connections/${action}`, { userId });
    },
    onSuccess: refreshPerson,
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Something went wrong",
        preset: "error",
      });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: () => api.delete("/api/connections/block", { userId }),
    onSuccess: refreshPerson,
    onError: () => toast({ title: "Could not unblock", preset: "error" }),
  });

  const messageMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string; recipient: { name: string; image?: string | null } | null }>(
        "/api/dms/find-or-create",
        { recipientId: userId },
      ),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      router.push({
        pathname: "/dm-chat",
        params: {
          conversationId: conversation.id,
          recipientName: conversation.recipient?.name ?? person?.name ?? "Direct Message",
          recipientImage: resolveUserImageUrl(conversation.recipient?.image) ?? "",
          isGroup: "false",
        },
      });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Couldn't start conversation",
        preset: "error",
      });
    },
  });

  const confirmDestructive = (action: "remove" | "block", title: string, message: string) => {
    setMenuOpen(false);
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: action === "block" ? "Block" : "Remove",
        style: "destructive",
        onPress: () => connectionAction.mutate(action),
      },
    ]);
  };

  const busy = connectionAction.isPending || messageMutation.isPending;

  return (
    <View style={styles.screen} testID="person-screen">
      <LinearGradient
        colors={["#4361EE", "#6D38E8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroHeader, { paddingTop: insets.top + 4 }]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="person-back-button"
          >
            <ArrowLeft size={21} color="#FFFFFF" strokeWidth={2.25} />
          </Pressable>
          <View style={styles.headerButton} />
          {person && !person.isSelf ? (
            <Pressable
              onPress={() => setMenuOpen(true)}
              hitSlop={8}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Profile actions"
              testID="person-menu-button"
            >
              <MoreVertical size={21} color="#FFFFFF" strokeWidth={2.25} />
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}
        </View>
        {person ? <ProfileHero person={person} /> : <View style={styles.heroPlaceholder} />}
      </LinearGradient>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : !person ? (
        <View style={styles.centered}>
          <Text style={styles.unavailableText}>This person is not available</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.profileScroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <QuickActions
            isSelf={person.isSelf}
            canMessage={person.canMessage}
            busy={busy}
            onMessage={() => messageMutation.mutate()}
            onEdit={() => router.push("/edit-profile")}
            onMore={() => setMenuOpen(true)}
          />

          {!person.isSelf ? (
            <ProfileSection title="Connections">
              <View style={styles.relationshipCard} testID="person-connection-relationship">
                <View style={styles.relationshipCopy}>
                  <Text style={styles.relationshipTitle}>
                    {connectionStatusLabel(person.connectionStatus)}
                  </Text>
                  <Text style={styles.relationshipDescription}>
                    Separate from any workspace you share.
                  </Text>
                </View>
                {person.connectionStatus === "connected" ? (
                  <View style={styles.connectedPill}>
                    <Check size={12} color="#168A55" />
                    <Text style={styles.connectedPillText}>Connected</Text>
                  </View>
                ) : (
                  <View style={styles.connectionActionWrap}>
                    <ConnectionButton
                      status={person.connectionStatus}
                      isBlockedByMe={person.isBlockedByMe}
                      busy={busy}
                      onRequest={() => connectionAction.mutate("request")}
                      onAccept={() => connectionAction.mutate("accept")}
                      onDecline={() => connectionAction.mutate("decline")}
                      onCancel={() => connectionAction.mutate("remove")}
                    />
                  </View>
                )}
              </View>
            </ProfileSection>
          ) : null}

          <AboutDetailsCard person={person} />

          <HighlightsCard person={person} />

          <ProfileSection title={`About ${firstName(person.name)}`}>
            <View style={styles.card}>
              {person.profileBio ? (
                <Text style={styles.aboutText}>{person.profileBio}</Text>
              ) : (
                <View style={styles.emptyRow}>
                  <View style={styles.emptyIcon}>
                    <FileText size={15} color="#8794A8" />
                  </View>
                  <Text style={styles.emptyCopy}>
                    No professional summary added yet.
                  </Text>
                </View>
              )}
            </View>
          </ProfileSection>

          <ProfileSection title="Workspace">
            <View
              style={[
                styles.card,
                person.sharedWorkspaces.length > 0 ? styles.workspaceCard : null,
              ]}
            >
              {person.sharedWorkspaces.length > 0 ? (
                person.sharedWorkspaces.map((workspace, index) => (
                  <WorkspaceRow
                    key={workspace.id}
                    workspace={workspace}
                    showDivider={index > 0}
                  />
                ))
              ) : (
                <View style={styles.emptyRow}>
                  <View style={styles.emptyIcon}>
                    <Users size={15} color="#8794A8" />
                  </View>
                  <Text style={styles.emptyCopy}>
                    You do not share a workspace yet.
                  </Text>
                </View>
              )}
            </View>
          </ProfileSection>
        </ScrollView>
      )}

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={[styles.menuSheet, { paddingBottom: insets.bottom + 12 }]}>
            {person?.connectionStatus === "connected" ? (
              <MenuRow
                icon={UserMinus}
                label="Remove connection"
                onPress={() =>
                  confirmDestructive(
                    "remove",
                    "Remove connection",
                    `${person.name ?? "This person"} will no longer be one of your connections.`,
                  )
                }
                testID="person-remove-connection"
              />
            ) : null}
            {person?.isBlockedByMe ? (
              <MenuRow
                icon={Ban}
                label="Unblock"
                onPress={() => {
                  setMenuOpen(false);
                  unblockMutation.mutate();
                }}
                testID="person-unblock"
              />
            ) : (
              <MenuRow
                icon={Ban}
                label="Block"
                destructive
                onPress={() =>
                  confirmDestructive(
                    "block",
                    "Block this person",
                    "They will not be able to message you or send you a connection request. Shared workspace access is unchanged.",
                  )
                }
                testID="person-block"
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ProfileHero({ person }: { person: PublicPersonProfile }) {
  const workspace = person.sharedWorkspaces[0];
  return (
    <View style={styles.profileHero}>
      <View style={styles.heroAvatarWrap}>
        <UserAvatar
          user={{ name: person.name, image: person.image }}
          size={76}
          radius={38}
          backgroundColor="#6366F1"
          textColor="#FFFFFF"
          fontSize={27}
        />
        {person.emailVerified ? (
          <View style={styles.verifiedBadge} testID="person-verified-badge">
            <BadgeCheck size={17} color="#FFFFFF" fill={BRAND} />
          </View>
        ) : null}
      </View>
      <View style={styles.heroIdentity}>
        <Text style={styles.heroName} numberOfLines={1}>
          {person.name ?? "Alenio member"}
        </Text>
        <Text style={styles.heroRole} numberOfLines={1}>
          {workspace ? formatTeamRole(workspace.role) : "Alenio member"}
        </Text>
        {!person.isSelf && person.connectionStatus === "connected" ? (
          <View style={styles.heroMetaRow}>
            <View style={styles.heroStatusDot} />
            <Text style={styles.heroMetaText}>Connected</Text>
          </View>
        ) : null}
        {workspace ? (
          <View style={styles.heroMetaRow}>
            <Building2 size={11} color="rgba(255,255,255,0.85)" />
            <Text style={styles.heroMetaText} numberOfLines={1}>
              {workspace.name}
            </Text>
          </View>
        ) : person.username ? (
          <Text style={styles.heroUsername} numberOfLines={1}>
            @{person.username}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function QuickActions({
  isSelf,
  canMessage,
  busy,
  onMessage,
  onEdit,
  onMore,
}: {
  isSelf: boolean;
  canMessage: boolean;
  busy: boolean;
  onMessage: () => void;
  onEdit: () => void;
  onMore: () => void;
}) {
  const actions = [
    {
      label: isSelf ? "Edit" : "Message",
      icon: isSelf ? Pencil : MessageSquare,
      onPress: isSelf ? onEdit : canMessage ? onMessage : () => {},
      disabled: busy,
    },
    { label: "Video call", icon: Video, onPress: () => {}, disabled: false },
    { label: "Recognition", icon: Trophy, onPress: () => {}, disabled: false },
    {
      label: "More",
      icon: MoreHorizontal,
      onPress: isSelf ? () => {} : onMore,
      disabled: false,
    },
  ];

  return (
    <View style={styles.quickActions}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            disabled={action.disabled}
            style={styles.quickAction}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <View style={styles.quickActionIcon}>
              <Icon size={20} color={BRAND} strokeWidth={2} />
            </View>
            <Text style={styles.quickActionLabel}>{action.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AboutDetailsCard({ person }: { person: PublicPersonProfile }) {
  const workspace = person.sharedWorkspaces[0];
  return (
    <ProfileSection title="About">
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <Building2 size={16} color={BRAND} />
          </View>
          <View style={styles.infoCopy}>
            <Text style={styles.infoPrimary}>
              {workspace
                ? `${formatTeamRole(workspace.role)} at ${workspace.name}`
                : "Alenio member"}
            </Text>
            <Text style={styles.infoSecondary}>
              Joined Alenio {formatMemberSince(person.memberSince)}
            </Text>
          </View>
        </View>
        {person.profileLocation ? (
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <MapPin size={16} color="#718097" />
            </View>
            <Text style={styles.infoPrimary}>{person.profileLocation}</Text>
          </View>
        ) : null}
        {person.profileWebsite ? (
          <Pressable
            onPress={() => void Linking.openURL(person.profileWebsite!)}
            style={styles.infoRow}
            accessibilityRole="link"
          >
            <View style={styles.infoIcon}>
              <Globe2 size={16} color={BRAND} />
            </View>
            <Text style={styles.infoLink} numberOfLines={1}>
              {formatWebsiteLabel(person.profileWebsite)}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ProfileSection>
  );
}

function HighlightsCard({ person }: { person: PublicPersonProfile }) {
  const connected = person.connectionStatus === "connected";
  const highlights = [
    {
      value: connected ? "Connected" : "—",
      label: "Current status",
      icon: Check,
      color: "#16A366",
    },
    {
      value: String(person.stats?.connections ?? 0),
      label: "Connections",
      icon: Trophy,
      color: "#F59E0B",
    },
    {
      value: String(person.stats?.mutualConnections ?? 0),
      label: "Mutual",
      icon: Target,
      color: "#7C3AED",
    },
  ];

  return (
    <ProfileSection title="Highlights">
      <View style={styles.highlightsCard}>
        {highlights.map((item) => {
          const Icon = item.icon;
          return (
            <View key={item.label} style={styles.highlightItem}>
              <Icon size={18} color={item.color} strokeWidth={2.2} />
              <Text style={styles.highlightValue} numberOfLines={1}>
                {item.value}
              </Text>
              <Text style={styles.highlightLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </ProfileSection>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function WorkspaceRow({
  workspace,
  showDivider,
}: {
  workspace: PublicProfileWorkspace;
  showDivider: boolean;
}) {
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/public-workspace",
          params: { teamId: workspace.id, teamName: workspace.name },
        })
      }
      style={({ pressed }) => [
        styles.workspaceRow,
        showDivider ? styles.workspaceDivider : null,
        pressed ? styles.rowPressed : null,
      ]}
      testID={`person-workspace-${workspace.id}`}
    >
      <WorkspaceTeamAvatar
        team={{ name: workspace.name, image: workspace.image }}
        size={42}
        radius={12}
        backgroundColor="#EEF2FF"
        textColor={BRAND}
        borderColor="#DDE4FF"
      />
      <View style={styles.workspaceCopy}>
        <Text style={styles.workspaceName} numberOfLines={1}>
          {workspace.name}
        </Text>
        <View style={styles.roleBadge}>
          <Building2 size={10} color={BRAND} />
          <Text style={styles.roleText}>{formatTeamRole(workspace.role)}</Text>
        </View>
      </View>
      <ChevronRight size={17} color="#A7B0C0" />
    </Pressable>
  );
}

function ActionButton({
  label,
  icon: Icon,
  primary,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  icon: typeof Pencil;
  primary?: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionButton, primary ? styles.primaryAction : styles.secondaryAction]}
      testID={testID}
    >
      <Icon size={16} color={primary ? "#FFFFFF" : BRAND} strokeWidth={2.25} />
      <Text style={[styles.actionLabel, { color: primary ? "#FFFFFF" : BRAND }]}>{label}</Text>
    </Pressable>
  );
}

function ConnectionButton({
  status,
  isBlockedByMe,
  busy,
  onRequest,
  onAccept,
  onDecline,
  onCancel,
}: {
  status: ConnectionStatus;
  isBlockedByMe: boolean;
  busy: boolean;
  onRequest: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  if (isBlockedByMe) {
    return <View style={styles.blockedState}><Text style={styles.blockedText}>Blocked</Text></View>;
  }
  if (status === "pending_incoming") {
    return (
      <View style={styles.pairedActions}>
        <ActionButton label="Accept" icon={Check} primary onPress={onAccept} disabled={busy} />
        <ActionButton label="Decline" icon={UserMinus} onPress={onDecline} disabled={busy} />
      </View>
    );
  }
  if (status === "pending_outgoing") {
    return (
      <ActionButton label="Requested" icon={Clock} onPress={onCancel} disabled={busy} />
    );
  }
  if (status === "connected") return null;
  return (
    <ActionButton label="Connect" icon={UserPlus} primary onPress={onRequest} disabled={busy} />
  );
}

function MenuRow({
  icon: Icon,
  label,
  onPress,
  destructive,
  testID,
}: {
  icon: typeof UserMinus;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuRow} testID={testID}>
      <Icon size={18} color={destructive ? "#DC2626" : "#334155"} strokeWidth={2.25} />
      <Text style={[styles.menuLabel, destructive ? { color: "#DC2626" } : null]}>{label}</Text>
    </Pressable>
  );
}

function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || "This Person";
}

function connectionStatusLabel(status: ConnectionStatus): string {
  if (status === "connected") return "You are connected";
  if (status === "pending_incoming") return "Wants to connect";
  if (status === "pending_outgoing") return "Request pending";
  if (status === "blocked") return "Connection blocked";
  return "Not connected";
}

function formatMemberSince(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatWebsiteLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`.replace(/\/$/, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  heroHeader: {
    paddingBottom: 29,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  heroPlaceholder: { height: 92 },
  profileHero: {
    minHeight: 96,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  heroAvatarWrap: {
    position: "relative",
    padding: 3,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.96)",
    shadowColor: "#172033",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
  },
  heroName: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.35,
  },
  heroRole: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
  },
  heroMetaRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#58E3A3",
  },
  heroMetaText: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
  },
  heroUsername: {
    marginTop: 5,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.78)",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  unavailableText: { fontSize: 15, fontWeight: "700", color: "#64748B", textAlign: "center" },
  profileScroll: {
    marginTop: -22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },
  quickActions: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
  },
  quickAction: {
    width: 72,
    alignItems: "center",
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E6E9F1",
    backgroundColor: "#FFFFFF",
    shadowColor: "#172033",
    shadowOpacity: 0.035,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
  },
  quickActionLabel: {
    marginTop: 6,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "600",
    textAlign: "center",
    color: "#536175",
  },
  connectionActionWrap: { marginTop: 4 },
  relationshipCard: { padding: 14, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E3E7EE", backgroundColor: "#FFFFFF" },
  relationshipCopy: { marginBottom: 10 },
  relationshipTitle: { fontSize: 13, fontWeight: "700", color: "#253047" },
  relationshipDescription: { marginTop: 3, fontSize: 10.5, lineHeight: 14, color: "#8794A8" },
  connectedPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "#ECFDF5" },
  connectedPillText: { fontSize: 10.5, fontWeight: "700", color: "#168A55" },
  verifiedBadge: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BRAND,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  infoCard: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: "#FFFFFF",
  },
  infoRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F4FF",
  },
  infoCopy: { flex: 1, minWidth: 0 },
  infoPrimary: {
    flexShrink: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
    color: "#334155",
  },
  infoSecondary: {
    marginTop: 2,
    fontSize: 9.5,
    lineHeight: 13,
    color: "#8794A8",
  },
  infoLink: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
    color: BRAND,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryAction: { backgroundColor: BRAND },
  secondaryAction: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E1F4" },
  actionLabel: { fontSize: 14, fontWeight: "700" },
  pairedActions: { flexDirection: "row", gap: 10 },
  blockedState: { minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA" },
  blockedText: { fontSize: 14, fontWeight: "700", color: "#DC2626" },
  highlightsCard: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
  },
  highlightItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  highlightValue: {
    marginTop: 5,
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "800",
    color: "#253047",
  },
  highlightLabel: {
    marginTop: 2,
    fontSize: 8.5,
    lineHeight: 11,
    color: "#8794A8",
  },
  section: { marginTop: 14 },
  sectionTitle: { marginBottom: 7, paddingHorizontal: 2, fontSize: 10.5, lineHeight: 13, fontWeight: "800", color: "#39465C", letterSpacing: -0.05 },
  card: {
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E7EE",
    padding: 15,
  },
  aboutText: { fontSize: 13, lineHeight: 20, color: "#475569" },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  emptyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F5F9",
  },
  emptyCopy: { flex: 1, fontSize: 12, lineHeight: 18, color: "#94A3B8" },
  workspaceCard: { padding: 0, overflow: "hidden" },
  workspaceRow: { minHeight: 66, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#FFFFFF" },
  workspaceDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E8ECF2" },
  rowPressed: { backgroundColor: "#F8FAFC" },
  workspaceCopy: { flex: 1, minWidth: 0 },
  workspaceName: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: "#172033" },
  roleBadge: { marginTop: 4, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EEF2FF", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  roleText: { fontSize: 9, lineHeight: 11, fontWeight: "700", color: BRAND },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)", justifyContent: "flex-end" },
  menuSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 15 },
  menuLabel: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
});
