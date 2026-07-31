import React, { useMemo } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { Building2, CheckCircle2, ChevronRight, CreditCard, Info, Plus, Users } from "lucide-react-native";
import type { Team } from "@/lib/types";
import { WorkspaceTeamAvatar, formatTeamRole } from "@/components/WorkspaceTeamUI";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";

type TeamWithRole = Team & { role?: string };

type PendingJoinRequest = {
  id: string;
  status: string;
  team: {
    id: string;
    name: string;
    image?: string | null;
  };
};

type Props = {
  teams: TeamWithRole[];
  activeTeamId: string | null | undefined;
  teamsLoading?: boolean;
  pendingCountMap?: Record<string, number>;
  pendingJoinRequests?: PendingJoinRequest[];
  cancelingRequestId?: string | null;
  onCancelPendingRequest?: (requestId: string) => void;
  /** Open the dedicated workspace page for the active workspace */
  onOpenWorkspacePage?: () => void;
  onOpenPeople?: () => void;
  onOpenSubscriptions?: () => void;
  onOpenWorkspaceDetails?: () => void;
  onAddWorkspace?: () => void;
};

function WorkspaceRow({
  team,
  pendingCount,
  onPress,
}: {
  team: TeamWithRole;
  pendingCount: number;
  onPress: () => void;
}) {
  const roleLabel = formatTeamRole(team.role);
  const subtitle = [roleLabel || null, pendingCount > 0 ? `${pendingCount} pending` : null]
    .filter(Boolean)
    .join(" · ");
  const memberCount = team._count?.members ?? team.members?.length ?? 0;

  return (
    <Pressable
        onPress={onPress}
        testID={`workspace-row-${team.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Manage ${team.name}, active workspace`}
        style={({ pressed }) => ({
          width: "100%",
          position: "relative",
          opacity: pressed ? 0.68 : 1,
        })}
      >
        <View
          style={{
            width: "100%",
            minHeight: 54,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingLeft: 14,
            paddingRight: 54,
            paddingTop: 7,
            paddingBottom: 4,
          }}
        >
        <WorkspaceTeamAvatar team={{ name: team.name, image: team.image }} size={38} radius={10} />
        <View
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 140,
            overflow: "hidden",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Text
              style={{
                flexShrink: 1,
                fontSize: 15,
                fontFamily: "Inter_600SemiBold",
                color: "#0F172A",
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {team.name}
            </Text>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 6,
                paddingVertical: 2,
                backgroundColor: "#EEF2FF",
              }}
            >
              <Text
                style={{
                  fontSize: 8,
                  lineHeight: 11,
                  fontFamily: "Inter_600SemiBold",
                  color: "#4361EE",
                  letterSpacing: 0.5,
                }}
              >
                ACTIVE
              </Text>
            </View>
          </View>
          <Text
            style={{
              marginTop: 2,
              fontSize: 10,
              fontFamily: "Inter_500Medium",
              color: "#64748B",
            }}
            numberOfLines={1}
          >
            {subtitle || "Workspace member"}
          </Text>
        </View>
        </View>
        <View
          style={{
            position: "absolute",
            right: 14,
            top: 14,
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#F8F7FF",
            borderWidth: 1,
            borderColor: "#F0EEFF",
          }}
        >
          <ChevronRight size={14} color="#6D4AFF" strokeWidth={2.3} />
        </View>
        <View
          style={{
            minHeight: 24,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingBottom: 4,
            gap: 10,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Users size={12} color="#6D4AFF" strokeWidth={2.1} />
            <Text style={{ fontSize: 9, color: "#667085" }} numberOfLines={1}>
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </Text>
          </View>
          <View style={{ width: 1, height: 18, backgroundColor: "#E8ECF3" }} />
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 5 }}>
            <CheckCircle2 size={12} color="#10B981" strokeWidth={2.1} />
            <Text style={{ fontSize: 9, color: "#667085" }} numberOfLines={1}>
              Active
            </Text>
          </View>
          <View style={{ width: 1, height: 18, backgroundColor: "#E8ECF3" }} />
          <View style={{ flex: 1.2, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Building2 size={12} color="#4361EE" strokeWidth={2.1} />
            <Text style={{ fontSize: 9, color: "#667085" }} numberOfLines={1}>
              Current workspace
            </Text>
          </View>
        </View>
    </Pressable>
  );
}

function WorkspaceAction({
  label,
  Icon,
  onPress,
  testID,
  showDivider,
}: {
  label: string;
  Icon: typeof Users;
  onPress?: () => void;
  testID: string;
  showDivider?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderLeftWidth: showDivider ? 1 : 0,
        borderLeftColor: "#EEF1F6",
      }}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        testID={testID}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={label}
        style={({ pressed }) => ({
          width: "100%",
          opacity: !onPress ? 0.45 : pressed ? 0.62 : 1,
        })}
      >
        <View
          style={{
            width: "100%",
            minHeight: 50,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 5,
            paddingVertical: 5,
          }}
        >
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#F1F0FF",
            }}
          >
            <Icon size={13} color="#6D4AFF" strokeWidth={2.05} />
          </View>
          <Text
            style={{
              width: "100%",
              marginTop: 2,
              fontSize: 9,
              lineHeight: 11,
              fontFamily: "Inter_600SemiBold",
              color: "#20283A",
              textAlign: "center",
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

export function ProfileWorkspaceList({
  teams,
  activeTeamId,
  teamsLoading = false,
  pendingCountMap = {},
  pendingJoinRequests = [],
  cancelingRequestId = null,
  onCancelPendingRequest,
  onOpenWorkspacePage,
  onOpenPeople,
  onOpenSubscriptions,
  onOpenWorkspaceDetails,
  onAddWorkspace,
}: Props) {
  const activeTeam = useMemo(
    () => teams.find((team) => team.id === activeTeamId) ?? teams[0] ?? null,
    [activeTeamId, teams]
  );

  if (teamsLoading && teams.length === 0) {
    return (
      <ProfileCard>
        <View style={{ paddingVertical: 28, alignItems: "center" }}>
          <ActivityIndicator color="#4361EE" />
        </View>
      </ProfileCard>
    );
  }

  if (!activeTeam && teams.length === 0) {
    return (
      <ProfileCard>
        <Pressable
          onPress={onAddWorkspace}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 18,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityRole="button"
          accessibilityLabel="Create or join a workspace"
        >
          <Plus size={16} color="#4361EE" strokeWidth={2.5} />
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#4361EE" }}>
            Create or join a workspace
          </Text>
        </Pressable>
      </ProfileCard>
    );
  }

  return (
    <>
      <ProfileCard
        style={{
          borderRadius: 14,
          borderColor: "#E6E9F1",
          shadowColor: "#4338CA",
          shadowOpacity: 0.045,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 1,
        }}
      >
        <Image
          source={require("@/assets/alenio-icon.png")}
          resizeMode="contain"
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 150,
            height: 150,
            right: -28,
            top: -22,
            opacity: 0.075,
            tintColor: "#6D4AFF",
            transform: [{ rotate: "-8deg" }],
          }}
        />
        <WorkspaceRow
          team={activeTeam}
          pendingCount={pendingCountMap[activeTeam.id] ?? 0}
          onPress={onOpenWorkspacePage ?? onOpenWorkspaceDetails ?? (() => undefined)}
        />
        <View style={{ height: 1, backgroundColor: "#F1F5F9", marginHorizontal: 14 }} />
        <View
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "stretch",
            paddingHorizontal: 4,
            paddingVertical: 2,
          }}
        >
          <WorkspaceAction
            label="People"
            Icon={Users}
            onPress={onOpenPeople}
            testID="workspace-home-people"
          />
          <WorkspaceAction
            label="Subscriptions"
            Icon={CreditCard}
            onPress={onOpenSubscriptions}
            testID="workspace-home-subscriptions"
            showDivider
          />
          <WorkspaceAction
            label="Workspace details"
            Icon={Info}
            onPress={onOpenWorkspaceDetails}
            testID="workspace-home-details"
            showDivider
          />
        </View>
      </ProfileCard>

      {pendingJoinRequests.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Text
            style={{
              marginBottom: 8,
              marginLeft: 4,
              fontSize: 11,
              fontFamily: "Inter_600SemiBold",
              color: "#94A3B8",
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Pending requests
          </Text>
          <ProfileCard>
            {pendingJoinRequests.map((request, index) => (
              <View key={request.id}>
                {index > 0 ? (
                  <View style={{ height: 1, backgroundColor: "#F1F5F9", marginHorizontal: 14 }} />
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                >
                  <WorkspaceTeamAvatar
                    team={{ name: request.team.name, image: request.team.image }}
                    size={36}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontFamily: "Inter_600SemiBold",
                        color: "#0F172A",
                        letterSpacing: -0.2,
                      }}
                      numberOfLines={1}
                    >
                      {request.team.name}
                    </Text>
                    <Text
                      style={{
                        marginTop: 2,
                        fontSize: 12,
                        fontFamily: "Inter_500Medium",
                        color: "#64748B",
                      }}
                    >
                      Request pending
                    </Text>
                  </View>
                  {onCancelPendingRequest ? (
                    <Pressable
                      onPress={() => onCancelPendingRequest(request.id)}
                      disabled={cancelingRequestId === request.id}
                      hitSlop={8}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      {cancelingRequestId === request.id ? (
                        <ActivityIndicator size="small" color="#EF4444" />
                      ) : (
                        <Text
                          style={{
                            fontSize: 13,
                            fontFamily: "Inter_600SemiBold",
                            color: "#EF4444",
                          }}
                        >
                          Cancel
                        </Text>
                      )}
                    </Pressable>
                  ) : (
                    <ChevronRight size={16} color="#CBD5E1" />
                  )}
                </View>
              </View>
            ))}
          </ProfileCard>
        </View>
      ) : null}
    </>
  );
}
