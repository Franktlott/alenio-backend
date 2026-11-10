import { Pressable, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { DevelopmentPlanTab } from "@/components/DevelopmentPlanTab";
import { OneOnOneHistoryTab } from "@/components/OneOnOneHistoryTab";
import { UserAvatar } from "@/components/UserAvatar";
import { WS } from "@/components/workspace/workspace-ui";
import { colors } from "@/theme";
import type { TeamMember } from "@/lib/types";
import type { WorkspaceDevelopmentSection } from "@/lib/workspace-development-navigation";

export type { WorkspaceDevelopmentSection };

type Props = {
  teamId: string;
  member: TeamMember;
  currentUserId: string | null;
  viewerRole: string | null;
  leaderName: string | null;
  leaderUserId: string | null;
  section: WorkspaceDevelopmentSection;
  onSectionChange: (section: WorkspaceDevelopmentSection) => void;
  onBack?: () => void;
  autoOpenCreateGoal?: boolean;
  onCreateGoalIntentHandled?: () => void;
  startCheckInToken?: number;
  preferredTemplateId?: string | null;
  plannedEventId?: string | null;
  initialCheckInId?: string | null;
  onCheckInFlowActiveChange?: (active: boolean) => void;
};

const SECTIONS: { key: WorkspaceDevelopmentSection; label: string }[] = [
  { key: "goals", label: "Goals" },
  { key: "check-ins", label: "Check-ins" },
];

export function WorkspaceMemberDevelopment({
  teamId,
  member,
  currentUserId,
  viewerRole,
  leaderName,
  leaderUserId,
  section,
  onSectionChange,
  onBack,
  autoOpenCreateGoal = false,
  onCreateGoalIntentHandled,
  startCheckInToken = 0,
  preferredTemplateId = null,
  plannedEventId = null,
  initialCheckInId = null,
  onCheckInFlowActiveChange,
}: Props) {
  const isSelf = member.userId === currentUserId;
  const canManageCheckIns =
    viewerRole === "owner" || viewerRole === "team_leader";
  const canManageGoals = isSelf || canManageCheckIns;
  const memberName =
    member.user.name?.trim() || member.user.email.split("@")[0] || "Member";

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {onBack ? (
        <View
          style={{
            minHeight: 45,
            marginHorizontal: WS.pageGutter + 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
          }}
        >
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(20, 30, 60, 0.08)",
              backgroundColor: "#FFFFFF",
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to members"
          >
            <ChevronLeft size={17} color="#475569" strokeWidth={2.3} />
          </Pressable>
          <UserAvatar
            user={member.user}
            size={30}
            radius={15}
            backgroundColor="#EEEAFE"
            textColor="#684BFF"
            fontSize={10}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                lineHeight: 15,
                fontWeight: "700",
                color: "#20283C",
              }}
            >
              {memberName}
            </Text>
            <Text style={{ fontSize: 9, lineHeight: 11, color: "#8A94A8" }}>
              Member development
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={{
          marginHorizontal: WS.pageGutter,
          marginTop: onBack ? 4 : 8,
          marginBottom: 6,
          height: 38,
          padding: 3,
          flexDirection: "row",
          alignItems: "stretch",
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: colors.borderStrong,
          borderRadius: 12,
        }}
        accessibilityRole="tablist"
      >
        {SECTIONS.map(({ key, label }) => {
          const selected = section === key;
          return (
            <Pressable
              key={key}
              onPress={() => onSectionChange(key)}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 9,
                backgroundColor: selected ? colors.brand : "transparent",
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              testID={`member-development-${key}`}
            >
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 16,
                  fontWeight: selected ? "700" : "600",
                  color: selected ? "#FFFFFF" : colors.textSecondary,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          flex: 1,
          minHeight: 0,
          paddingHorizontal: WS.pageGutter + 8,
          paddingBottom: 4,
        }}
      >
        {section === "goals" ? (
          <DevelopmentPlanTab
            teamId={teamId}
            memberUserId={member.userId}
            memberName={memberName}
            isSelf={isSelf}
            memberImage={member.user.image}
            managerName={leaderName}
            canCreate={canManageGoals}
            canAddNotes={canManageGoals}
            canCompleteSteps={canManageGoals}
            autoOpenCreate={autoOpenCreateGoal}
            onAutoOpenCreateHandled={() => {
              onCreateGoalIntentHandled?.();
            }}
            embeddedListScroll
          />
        ) : (
          <OneOnOneHistoryTab
            teamId={teamId}
            memberUserId={member.userId}
            memberName={memberName}
            memberImage={member.user.image}
            managerName={leaderName}
            leaderUserId={leaderUserId}
            canCreate={canManageCheckIns}
            canModify={canManageCheckIns}
            isSelf={isSelf}
            myRole={viewerRole}
            startCheckInToken={startCheckInToken}
            preferredTemplateId={preferredTemplateId}
            plannedEventId={plannedEventId}
            initialMeetingId={initialCheckInId}
            onFlowActiveChange={onCheckInFlowActiveChange}
            embeddedListScroll
          />
        )}
      </View>
    </View>
  );
}
