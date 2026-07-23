import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Pressable,
  Modal,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Scale,
  Shield,
  User,
  Users,
  X,
} from "lucide-react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { BillingPortalWebViewModal } from "@/components/BillingPortalWebViewModal";
import { WorkspaceTeamAvatar, formatTeamRole } from "@/components/WorkspaceTeamUI";
import {
  PROFILE_UI,
  ProfileCard,
} from "@/components/profile/ProfileEnterpriseUI";
import { EditWorkspaceModal } from "@/components/EditWorkspaceModal";
import {
  billingCycleLabelFromSubscription,
  openWorkspaceBilling,
  pendingWorkspaceRow,
  planBadgeLabel,
  isPaidPlanBadge,
  rowFromTeamAndSubscription,
  tierFromPlan,
  workspaceSubscriptionLine,
  workspaceSubscriptionTone,
  type SubscriptionApiRow,
  type WorkspaceBillingRow,
  type WorkspaceSubscriptionTone,
} from "@/lib/account-hub-api";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import {
  ACCOUNT_HUB_TITLE,
} from "@/lib/plan-access-copy";

function canEditWorkspace(role: string | undefined | null) {
  return ["owner", "team_leader"].includes((role ?? "").trim().toLowerCase());
}

const TEAM_ACCENT = "#4361EE";
const FREE_ACCENT = "#64748B";
const WORKSPACE_ROW_PADDING_V = 10;
const WORKSPACE_ROW_PADDING_LEFT = 18;
const WORKSPACE_ROW_PADDING_RIGHT = 14;
const WORKSPACE_AVATAR_GAP = 10;
const WORKSPACE_AVATAR_SIZE = 32;
const WORKSPACE_LINE_GAP = 3;
const WORKSPACE_CARD_GAP = 6;

const PANEL_ACTION_CARD_STYLE = {
  backgroundColor: "#EEF2FF",
  borderRadius: 12,
  paddingVertical: 8,
  paddingHorizontal: 10,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 8,
};

const FREE_INCLUDED = ["Activity feed", "Team chat", "Team members"] as const;

const TEAM_FEATURES = [
  "Tasks & action items",
  "Team calendar",
  "Metrics & dashboards",
  "Workflow execution",
  "Performance insights",
  "Celebrations & shoutouts",
  "Priority support",
] as const;

type TeamListItem = {
  id: string;
  name: string;
  image: string | null;
  role: string;
  _count?: { members: number };
};

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RoleBadge({ role }: { role: string }) {
  const normalized = role.trim().toLowerCase();
  const isOwner = normalized === "owner";
  const isAdmin = normalized === "admin" || normalized === "team_leader";
  return (
    <View
      style={{
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: isOwner ? "#EEF2FF" : isAdmin ? "#E0F2FE" : "#F1F5F9",
        borderWidth: 1,
        borderColor: isOwner ? "#C7D2FE" : isAdmin ? "#BAE6FD" : "#E2E8F0",
      }}
    >
      <Text
        style={{
          fontSize: 7,
          fontWeight: "700",
          color: isOwner ? "#4338CA" : isAdmin ? "#0369A1" : "#64748B",
          letterSpacing: 0.4,
        }}
      >
        {formatTeamRole(role).toUpperCase()}
      </Text>
    </View>
  );
}

function ListPlanBadge({ plan }: { plan: string | null | undefined }) {
  const label = planBadgeLabel(plan);
  const isPaid = isPaidPlanBadge(label);
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: isPaid ? TEAM_ACCENT : "#F1F5F9",
        borderWidth: isPaid ? 0 : 1,
        borderColor: "#E2E8F0",
      }}
    >
      <Text
        style={{
          fontSize: 8,
          fontWeight: "800",
          color: isPaid ? "#FFFFFF" : "#64748B",
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function StatusDot({ active, tone = "active" }: { active?: boolean; tone?: WorkspaceSubscriptionTone }) {
  const color =
    tone === "canceling" ? "#F59E0B" : tone === "issue" ? "#EF4444" : tone === "canceled" ? "#94A3B8" : active ? "#22C55E" : "#94A3B8";
  return (
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: color,
      }}
    />
  );
}

function SubscriptionStatusIcon({
  tone,
  hasPeriodEnd,
}: {
  tone: WorkspaceSubscriptionTone;
  hasPeriodEnd: boolean;
}) {
  if (tone === "canceling") {
    return <Clock size={10} color="#D97706" />;
  }
  if (tone === "active" && hasPeriodEnd) {
    return <Calendar size={10} color="#94A3B8" />;
  }
  return <StatusDot active={tone === "active"} tone={tone} />;
}

function subscriptionStatusTextColor(tone: WorkspaceSubscriptionTone): string {
  if (tone === "canceling") return "#B45309";
  if (tone === "issue") return "#DC2626";
  if (tone === "canceled") return "#64748B";
  return "#64748B";
}

function selectedWorkspaceStatusLabel(
  tier: "free" | "team" | "pending",
  tone: WorkspaceSubscriptionTone,
): string {
  if (tier === "pending" || tone === "pending") return "Loading…";
  if (tier !== "team") return "Free plan";
  if (tone === "canceling") return "Canceling";
  if (tone === "issue") return "Payment issue";
  if (tone === "canceled") return "Ended";
  return "Active";
}

function FeatureRow({ label, accent = TEAM_ACCENT }: { label: string; accent?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 }}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check size={10} color={accent} strokeWidth={3} />
      </View>
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 15, color: "#334155", fontWeight: "500" }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatColumn({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", minWidth: 0, paddingHorizontal: 2 }}>
      <Icon size={16} color={TEAM_ACCENT} />
      <Text style={{ fontSize: 9, color: "#64748B", marginTop: 4, textAlign: "center" }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A", marginTop: 2, textAlign: "center" }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatDivider() {
  return <View style={{ width: 1, alignSelf: "stretch", backgroundColor: "#F1F5F9", marginVertical: 2 }} />;
}

function ActionIconBox({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </View>
  );
}

function SelectedPlanBadge({ plan }: { plan: string | null | undefined }) {
  const label = planBadgeLabel(plan);
  const isPaid = isPaidPlanBadge(label);
  return (
    <View
      style={{
        backgroundColor: isPaid ? TEAM_ACCENT : FREE_ACCENT,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: "white", fontSize: 9, fontWeight: "800", letterSpacing: 0.2 }}>
        {label}
      </Text>
    </View>
  );
}

function PanelActionCard({
  icon,
  title,
  subtitle,
  trailing,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  trailing: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const body = (
    <View style={PANEL_ACTION_CARD_STYLE}>
      <ActionIconBox>{icon}</ActionIconBox>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A", lineHeight: 15 }}>{title}</Text>
        <Text style={{ fontSize: 10, color: "#64748B", marginTop: 1, lineHeight: 12 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {trailing}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>
      {body}
    </Pressable>
  );
}

function OpenWebDashboardButton({
  onPress,
  loading = false,
}: {
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      style={{
        backgroundColor: TEAM_ACCENT,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 5,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        opacity: loading ? 0.7 : 1,
      }}
      testID="open-web-dashboard-button"
    >
      {loading ? (
        <ActivityIndicator color="white" size="small" />
      ) : (
        <>
          <Text
            style={{
              color: "white",
              fontSize: 9,
              fontWeight: "700",
              lineHeight: 11,
              letterSpacing: 0.1,
            }}
          >
            Open Web
          </Text>
          <ExternalLink size={11} color="white" strokeWidth={2.5} />
        </>
      )}
    </TouchableOpacity>
  );
}

function SelectedWorkspacePanel({
  workspace,
  selectedTier,
  billingCycleLabel,
  onOpenWeb,
  onComparePlans,
  onEditWorkspace,
  isOpeningBilling = false,
}: {
  workspace: WorkspaceBillingRow;
  selectedTier: "free" | "team" | "pending";
  billingCycleLabel: string;
  onOpenWeb: () => void;
  onComparePlans: () => void;
  onEditWorkspace?: () => void;
  isOpeningBilling?: boolean;
}) {
  const subscription = workspace.subscription;
  const subscriptionTone = workspaceSubscriptionTone(subscription);
  const renewalValue =
    selectedTier === "team" && subscription?.currentPeriodEnd
      ? formatShortDate(subscription.currentPeriodEnd)
      : selectedTier === "pending"
        ? "…"
        : "—";
  const renewalLabel = subscriptionTone === "canceling" ? "Ends on" : "Renewal date";
  const statusLabel = selectedWorkspaceStatusLabel(selectedTier, subscriptionTone);
  const canEdit = !!onEditWorkspace && canEditWorkspace(workspace.role);

  return (
    <View>
      <Text style={[PROFILE_UI.sectionLabel, { marginBottom: 8 }]}>Selected Workspace</Text>

      <ProfileCard style={{ borderRadius: 14, borderColor: "#E2E8F0" }}>
        <View style={{ padding: 10, paddingBottom: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Pressable
              onPress={canEdit ? onEditWorkspace : undefined}
              disabled={!canEdit}
              hitSlop={4}
              testID="account-hub-edit-workspace-avatar"
              style={({ pressed }) => ({ opacity: canEdit && pressed ? 0.85 : 1 })}
              accessibilityRole={canEdit ? "button" : undefined}
              accessibilityLabel={canEdit ? "Edit workspace photo" : undefined}
            >
              <View>
                <WorkspaceTeamAvatar team={workspace} size={40} active />
                {canEdit ? (
                  <View
                    style={{
                      position: "absolute",
                      right: -3,
                      bottom: -3,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: TEAM_ACCENT,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: "#FFFFFF",
                    }}
                  >
                    <Pencil size={9} color="#FFFFFF" strokeWidth={2.5} />
                  </View>
                ) : null}
              </View>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: "800", color: "#0F172A" }} numberOfLines={1}>
                  {workspace.name}
                </Text>
                {canEdit ? (
                  <Pressable
                    onPress={onEditWorkspace}
                    hitSlop={8}
                    testID="account-hub-edit-workspace"
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.6 : 1,
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: "#EEF2FF",
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                    accessibilityRole="button"
                    accessibilityLabel="Edit workspace name and photo"
                  >
                    <Pencil size={13} color={TEAM_ACCENT} strokeWidth={2.25} />
                  </Pressable>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                {selectedTier === "pending" ? (
                  <View
                    style={{
                      backgroundColor: "#E2E8F0",
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: "#64748B", fontSize: 9, fontWeight: "800", letterSpacing: 0.3 }}>
                      …
                    </Text>
                  </View>
                ) : (
                  <SelectedPlanBadge plan={subscription?.plan} />
                )}
                <StatusDot
                  active={selectedTier === "team" && subscriptionTone === "active"}
                  tone={selectedTier === "team" || selectedTier === "pending" ? subscriptionTone : "free"}
                />
                <Text
                  style={{
                    fontSize: 11,
                    color: subscriptionTone === "canceling" ? "#B45309" : "#64748B",
                    fontWeight: subscriptionTone === "canceling" ? "600" : "400",
                  }}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "stretch", paddingVertical: 8, marginBottom: 10 }}>
            <StatColumn icon={Users} label="Members" value={String(workspace.memberCount)} />
            <StatDivider />
            <StatColumn icon={Calendar} label={renewalLabel} value={renewalValue} />
            <StatDivider />
            <StatColumn icon={RefreshCw} label="Billing cycle" value={billingCycleLabel} />
            <StatDivider />
            <StatColumn icon={User} label="Role" value={formatTeamRole(workspace.role)} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 10, paddingBottom: 8, gap: 5 }}>
          {canEdit ? (
            <PanelActionCard
              icon={<Pencil size={14} color={TEAM_ACCENT} />}
              title="Edit Workspace"
              subtitle="Update the workspace name and group photo."
              trailing={<ChevronRight size={14} color="#CBD5E1" />}
              onPress={onEditWorkspace}
              testID="account-hub-edit-workspace-card"
            />
          ) : null}

          <PanelActionCard
            icon={<Globe size={14} color={TEAM_ACCENT} />}
            title="Manage on Web"
            subtitle="Manage billing, invoices, payment methods, members, and upgrades."
            trailing={
              <OpenWebDashboardButton onPress={onOpenWeb} loading={isOpeningBilling} />
            }
          />

          <PanelActionCard
            icon={<Scale size={14} color={TEAM_ACCENT} />}
            title="Compare Plans"
            subtitle="See all plan features and find the right fit for your team."
            trailing={<ChevronRight size={14} color="#CBD5E1" />}
            onPress={onComparePlans}
            testID="compare-plans-toggle"
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 8,
            backgroundColor: "#EEF2FF",
            paddingHorizontal: 10,
            paddingVertical: 10,
          }}
          testID="account-hub-info-banner"
        >
          <Info size={14} color={TEAM_ACCENT} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 11, color: "#334155", lineHeight: 15 }} numberOfLines={2}>
            Changes to plans, billing, and payment methods must be managed from{" "}
            <Text style={{ fontWeight: "700", color: "#0F172A" }}>the web dashboard</Text>.
          </Text>
        </View>
      </ProfileCard>
    </View>
  );
}

function WorkspaceCardList({
  rows,
  selectedTeamId,
  plansLoading,
  subscriptionByTeamId,
  onSelect,
}: {
  rows: WorkspaceBillingRow[];
  selectedTeamId: string | null;
  plansLoading: boolean;
  subscriptionByTeamId: Map<string, unknown>;
  onSelect: (teamId: string) => void;
}) {
  const renderCard = (row: WorkspaceBillingRow, index: number) => {
    const selected = row.id === selectedTeamId;
    const subscription = row.subscription;
    const planLoading = !subscription && (plansLoading || !subscriptionByTeamId.has(row.id));
    const tier = subscription ? tierFromPlan(subscription.plan) : null;
    const isTeam = tier === "team";
    const subscriptionTone = workspaceSubscriptionTone(subscription);
    const renewalLabel = row.subscriptionError
      ? "Couldn't load plan"
      : planLoading
        ? "Loading plan…"
        : workspaceSubscriptionLine(subscription, formatShortDate);

    return (
      <View
        key={row.id}
        style={{
          marginBottom: index < rows.length - 1 ? WORKSPACE_CARD_GAP : 0,
        }}
      >
        <ProfileCard
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: selected ? "#C7D2FE" : "#E2E8F0",
            backgroundColor: selected ? "#FAFBFF" : "#FFFFFF",
            shadowColor: "#64748B",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: selected ? 0.05 : 0.03,
            shadowRadius: 4,
            elevation: selected ? 1 : 0,
          }}
        >
          <Pressable
            onPress={() => onSelect(row.id)}
            testID={`workspace-billing-row-${row.id}`}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "rgba(248, 250, 252, 0.8)" : "transparent",
            })}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingLeft: WORKSPACE_ROW_PADDING_LEFT,
                paddingRight: WORKSPACE_ROW_PADDING_RIGHT,
                paddingVertical: WORKSPACE_ROW_PADDING_V,
              }}
            >
              <View style={{ marginRight: WORKSPACE_AVATAR_GAP }}>
                <WorkspaceTeamAvatar team={row} size={WORKSPACE_AVATAR_SIZE} active={selected} />
              </View>
              <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A", lineHeight: 15 }} numberOfLines={1}>
                  {row.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: WORKSPACE_LINE_GAP }}>
                  <RoleBadge role={row.role} />
                  <Text style={{ fontSize: 10, color: "#94A3B8", marginHorizontal: 4 }}>·</Text>
                  <Text style={{ fontSize: 10, color: "#64748B", lineHeight: 12 }}>
                    {row.memberCount} {row.memberCount === 1 ? "member" : "members"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: WORKSPACE_LINE_GAP }}>
                  {planLoading ? (
                    <StatusDot active={false} />
                  ) : (
                    <SubscriptionStatusIcon
                      tone={subscriptionTone}
                      hasPeriodEnd={isTeam && !!subscription?.currentPeriodEnd}
                    />
                  )}
                  <Text
                    style={{
                      fontSize: 10,
                      color: planLoading || row.subscriptionError
                        ? "#64748B"
                        : subscriptionStatusTextColor(subscriptionTone),
                      marginLeft: 4,
                      lineHeight: 12,
                      fontWeight: subscriptionTone === "canceling" ? "600" : "400",
                    }}
                    numberOfLines={1}
                  >
                    {renewalLabel}
                  </Text>
                </View>
              </View>
              {planLoading ? (
                <ActivityIndicator size="small" color="#94A3B8" style={{ marginRight: 4 }} />
              ) : row.subscriptionError ? (
                <View style={{ paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 8, fontWeight: "700", color: "#94A3B8" }}>—</Text>
                </View>
              ) : (
                <ListPlanBadge plan={subscription?.plan} />
              )}
              <ChevronRight size={16} color="#CBD5E1" style={{ marginLeft: 6 }} />
            </View>
          </Pressable>
        </ProfileCard>
      </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 2 }}
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      bounces={rows.length > 2}
      keyboardShouldPersistTaps="handled"
    >
      {rows.map(renderCard)}
    </ScrollView>
  );
}

function ComparePlansModal({
  visible,
  selectedTier,
  onClose,
}: {
  visible: boolean;
  selectedTier: "free" | "team";
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.86);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            height: sheetHeight,
            backgroundColor: "white",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Compare Plans</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close compare plans"
              testID="compare-plans-close"
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            bounces
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#F8FAFC",
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: selectedTier === "free" ? FREE_ACCENT : "#E2E8F0",
                  padding: 12,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#0F172A" }}>Free</Text>
                <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Chat and team basics</Text>
                {FREE_INCLUDED.map((label) => (
                  <FeatureRow key={label} label={label} accent="#0284C7" />
                ))}
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#F8FAFC",
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: selectedTier === "team" ? TEAM_ACCENT : "#E2E8F0",
                  padding: 12,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#0F172A" }}>Team</Text>
                <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Execution and insights</Text>
                {TEAM_FEATURES.map((label) => (
                  <FeatureRow key={label} label={label} accent={TEAM_ACCENT} />
                ))}
              </View>
            </View>
          </ScrollView>
          <TouchableOpacity
            onPress={onClose}
            style={{
              marginTop: 8,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: "#F1F5F9",
              alignItems: "center",
            }}
            testID="compare-plans-cancel"
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#64748B" }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function AccountHubScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { teamId: teamIdParam, billing: billingFlash } = useLocalSearchParams<{
    teamId?: string;
    billing?: string;
  }>();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [comparePlansOpen, setComparePlansOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceBillingRow | null>(null);
  const [billingUrl, setBillingUrl] = useState<string | null>(null);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingWorkspaceName, setBillingWorkspaceName] = useState<string | null>(null);

  const {
    data: teams = [],
    isLoading: teamsLoading,
    isError: teamsError,
    error: teamsLoadError,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<TeamListItem[]>("/api/teams"),
    staleTime: 30_000,
  });

  const subscriptionQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["subscription", team.id],
      queryFn: () => api.get<SubscriptionApiRow>(`/api/teams/${team.id}/subscription`),
      enabled: !!team.id,
      staleTime: 0,
      retry: 1,
    })),
  });

  const subscriptionByTeamId = useMemo(() => {
    const map = new Map<string, SubscriptionApiRow>();
    teams.forEach((team, index) => {
      const sub = subscriptionQueries[index]?.data;
      if (sub) map.set(team.id, sub);
    });
    return map;
  }, [teams, subscriptionQueries]);

  const workspaces = useMemo((): WorkspaceBillingRow[] => {
    return teams.map((team, index) => {
      const sub = subscriptionByTeamId.get(team.id);
      if (sub) return rowFromTeamAndSubscription(team, sub);
      const query = subscriptionQueries[index];
      const failed = !!query && !query.isLoading && !query.isFetching && query.isError;
      return pendingWorkspaceRow(team, failed);
    });
  }, [teams, subscriptionByTeamId, subscriptionQueries]);

  const plansLoading = subscriptionQueries.some((q) => q.isLoading || q.isFetching);
  const isLoading = teamsLoading;
  const isError = teamsError;
  const error = teamsLoadError;

  const refetch = useCallback(() => {
    void refetchTeams();
    subscriptionQueries.forEach((q) => void q.refetch());
  }, [refetchTeams, subscriptionQueries]);

  useFocusEffect(
    useCallback(() => {
      void refetchTeams();
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
    }, [queryClient, refetchTeams]),
  );

  const isRefetching = teamsLoading || subscriptionQueries.some((q) => q.isRefetching);

  useEffect(() => {
    if (workspaces.length === 0) return;
    const fromParam = typeof teamIdParam === "string" ? teamIdParam : null;
    const preferred =
      (fromParam && workspaces.some((w) => w.id === fromParam) ? fromParam : null) ??
      (activeTeamId && workspaces.some((w) => w.id === activeTeamId) ? activeTeamId : null) ??
      workspaces[0]?.id ??
      null;
    setSelectedTeamId((prev) => (prev && workspaces.some((w) => w.id === prev) ? prev : preferred));
  }, [workspaces, teamIdParam, activeTeamId]);

  useEffect(() => {
    if (billingFlash === "success") {
      toast({ title: "Subscription updated", preset: "done" });
      void refetch();
      router.setParams({ billing: undefined });
    }
  }, [billingFlash, refetch]);

  const selected = workspaces.find((w) => w.id === selectedTeamId) ?? null;
  const selectedTier: "free" | "team" | "pending" = !selected?.subscription
    ? "pending"
    : tierFromPlan(selected.subscription.plan);
  const billingCycleLabel = billingCycleLabelFromSubscription(selected?.subscription);

  const billingMutation = useMutation({
    mutationFn: (workspace: WorkspaceBillingRow) => openWorkspaceBilling(workspace),
    onSuccess: (result, workspace) => {
      if (result.openedWebFallback) {
        toast({ title: "Opening web billing…", preset: "none" });
        return;
      }
      setBillingWorkspaceName(workspace.name);
      setBillingUrl(result.url);
      setBillingModalOpen(true);
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Could not open billing", preset: "error" });
    },
  });

  const closeBillingModal = useCallback(() => {
    setBillingModalOpen(false);
    setBillingUrl(null);
    setBillingWorkspaceName(null);
    void queryClient.invalidateQueries({ queryKey: ["subscription"] });
  }, [queryClient]);

  const onBillingFlowComplete = useCallback(
    (result: "success" | "cancel") => {
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      if (result === "success") {
        toast({ title: "Subscription updated", preset: "done" });
      }
    },
    [queryClient],
  );

  const openSelectedWorkspaceBilling = useCallback(() => {
    if (!selected) return;
    billingMutation.mutate(selected);
  }, [billingMutation, selected]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top", "bottom"]} testID="account-hub-screen">
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 6,
            paddingBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity onPress={() => router.back()} testID="account-hub-back" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
            <Shield size={18} color="white" />
            <Text style={{ color: "white", fontSize: 17, fontWeight: "700" }}>{ACCOUNT_HUB_TITLE}</Text>
          </View>
          <Image source={require("@/assets/alenio-icon.png")} style={{ width: 28, height: 28, borderRadius: 6 }} />
        </View>
      </LinearGradient>

      <View
        style={{
          flex: 1,
          position: "relative",
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: "transparent",
        }}
      >
        {isLoading ? (
          <View style={{ flex: 1, minHeight: 280, alignItems: "center", justifyContent: "center" }} testID="account-hub-loading">
            <ActivityIndicator color="#4361EE" size="large" />
            <Text style={{ marginTop: 12, fontSize: 14, color: "#64748B" }}>Loading workplaces…</Text>
          </View>
        ) : null}

        {isError ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 20,
              paddingHorizontal: 12,
              backgroundColor: "white",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#FECACA",
            }}
            testID="account-hub-error"
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 6, textAlign: "center" }}>
              Couldn't load workplaces
            </Text>
            <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 18, marginBottom: 14 }}>
              {(error as Error)?.message ?? "Check your connection and try again."}
            </Text>
            <TouchableOpacity
              onPress={() => void refetch()}
              style={{ backgroundColor: "#4361EE", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isLoading && !isError && workspaces.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 20,
              paddingHorizontal: 12,
              backgroundColor: "white",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
            testID="account-hub-empty"
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 6 }}>No workplaces yet</Text>
            <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 18, marginBottom: 14 }}>
              Create or join a workplace from your profile to manage billing here.
            </Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/onboarding", params: { intent: "add" } })}
              style={{ backgroundColor: "#4361EE", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>Add workspace</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isLoading && !isError && workspaces.length > 0 ? (
          <View style={{ flex: 1, minHeight: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexShrink: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={PROFILE_UI.sectionLabel}>Your Workspaces</Text>
                <View
                  style={{
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: "#E2E8F0",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 5,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#64748B" }}>{workspaces.length}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: "/onboarding", params: { intent: "add" } })}
                testID="account-hub-add-workspace"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: "#C7D2FE",
                  gap: 4,
                }}
              >
                <Plus size={12} color={TEAM_ACCENT} strokeWidth={2.5} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: TEAM_ACCENT }}>Add workspace</Text>
              </Pressable>
            </View>

            <View style={{ flex: 1, minHeight: 0 }}>
              <WorkspaceCardList
                rows={workspaces}
                selectedTeamId={selectedTeamId}
                plansLoading={plansLoading}
                subscriptionByTeamId={subscriptionByTeamId}
                onSelect={setSelectedTeamId}
              />
            </View>

            {selected ? (
              <View style={{ flexShrink: 0, marginTop: 8 }}>
                <SelectedWorkspacePanel
                  workspace={selected}
                  selectedTier={selectedTier}
                  billingCycleLabel={billingCycleLabel}
                  onOpenWeb={openSelectedWorkspaceBilling}
                  onComparePlans={() => setComparePlansOpen(true)}
                  onEditWorkspace={
                    canEditWorkspace(selected.role) ? () => setEditingWorkspace(selected) : undefined
                  }
                  isOpeningBilling={billingMutation.isPending}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {isRefetching ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", bottom: Math.max(insets.bottom, 8), left: 0, right: 0, alignItems: "center" }}
          >
            <ActivityIndicator color="#4361EE" size="small" />
          </View>
        ) : null}
      </View>

      <ComparePlansModal
        visible={comparePlansOpen}
        selectedTier={selectedTier === "pending" ? "free" : selectedTier}
        onClose={() => setComparePlansOpen(false)}
      />

      <EditWorkspaceModal
        workspace={editingWorkspace}
        visible={!!editingWorkspace}
        onClose={() => setEditingWorkspace(null)}
      />

      <BillingPortalWebViewModal
        visible={billingModalOpen}
        url={billingUrl}
        workspaceName={billingWorkspaceName}
        onClose={closeBillingModal}
        onFlowComplete={onBillingFlowComplete}
      />
    </SafeAreaView>
  );
}
