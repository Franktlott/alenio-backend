import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import {
  Check,
  ChevronRight,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api/api";
import type { TeamMember, TeamRole } from "@/lib/types";
import {
  EDITABLE_WORKSPACE_ROLES,
  canEditWorkspacePermissionTarget,
  getWorkspaceRolePresentation,
  type EditableWorkspaceRole,
} from "@/lib/workspace-permissions";
import { canBulkRemoveWorkspaceMember } from "@/lib/workspace-members";

type Props = {
  visible: boolean;
  teamId: string;
  member: TeamMember | null;
  viewerRole: TeamRole | null;
  viewerUserId: string | null;
  onClose: () => void;
};

/** Both actions here change someone else's access, so both are confirmed. */
type Confirming =
  | { kind: "role"; role: EditableWorkspaceRole }
  | { kind: "remove" };

/**
 * Role and roster actions for one member, opened from their row on the Team
 * tab. The same rules the API enforces decide what appears here, so nothing on
 * screen can fail on the server: only an owner changes roles, and owners and
 * team leaders cannot be removed at all.
 */
export function MemberManageSheet({
  visible,
  teamId,
  member,
  viewerRole,
  viewerUserId,
  onClose,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  // A confirmation belongs to one member, so reopening on someone else starts
  // from the action list rather than a question about the previous person.
  useEffect(() => {
    if (!visible) setConfirming(null);
  }, [visible, member?.userId]);

  const targetRole = (member?.role ?? "member") as TeamRole;
  const displayName =
    member?.user.name?.trim() || member?.user.email?.trim() || "This member";
  const firstName = displayName.split(/\s+/)[0] ?? displayName;

  const canChangeRole = canEditWorkspacePermissionTarget({
    viewerRole,
    targetRole,
  });
  const canRemove = member
    ? canBulkRemoveWorkspaceMember(viewerRole, member, viewerUserId)
    : false;

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["team", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
      queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["team-momentum", teamId] }),
    ]);
  };

  const roleMutation = useMutation({
    mutationFn: (role: EditableWorkspaceRole) =>
      api.patch(
        `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(
          member!.userId,
        )}/role`,
        { role },
      ),
    onSuccess: async (_result, role) => {
      await refreshWorkspace();
      setConfirming(null);
      toast({
        title:
          role === "team_leader"
            ? `${firstName} is now a team leader`
            : `${firstName} is now a member`,
        preset: "done",
      });
      onClose();
    },
    onError: (error: Error) => {
      setConfirming(null);
      toast({
        title: error.message || "Could not change role",
        preset: "error",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () =>
      api.delete(
        `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(
          member!.userId,
        )}`,
      ),
    onSuccess: async () => {
      await refreshWorkspace();
      setConfirming(null);
      toast({ title: `${firstName} was removed`, preset: "done" });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: error.message || "Could not remove member",
        preset: "error",
      });
    },
  });

  const busy = roleMutation.isPending || removeMutation.isPending;

  if (!member) return null;

  const promotion = confirming?.kind === "role" && confirming.role === "team_leader";
  const sheetTitle =
    confirming?.kind === "remove"
      ? "Remove from workspace?"
      : confirming?.kind === "role"
        ? promotion
          ? "Make a team leader?"
          : "Change to member?"
        : "Manage member";
  const sheetSubtitle =
    confirming?.kind === "remove"
      ? "This cannot be undone"
      : confirming?.kind === "role"
        ? "Their access changes right away"
        : displayName;

  const confirmBody =
    confirming?.kind === "remove"
      ? `${displayName} loses access to this workspace. Their goals are archived and any open check-in tasks are closed. Published check-ins are kept.`
      : promotion
        ? `${firstName} will be able to run check-ins, manage development for other people, and remove members.`
        : `${firstName} keeps their own work but stops managing other people's development, and can no longer remove members.`;

  const confirmLabel =
    confirming?.kind === "remove"
      ? "Remove member"
      : promotion
        ? "Make team leader"
        : "Change to member";

  const runConfirmedAction = () => {
    if (!confirming) return;
    if (confirming.kind === "remove") removeMutation.mutate();
    else roleMutation.mutate(confirming.role);
  };

  return (
    <AlenioBottomSheet
      visible={visible}
      title={sheetTitle}
      subtitle={sheetSubtitle}
      onClose={busy ? () => undefined : onClose}
      compact
      showCloseButton
      scrollEnabled={!confirming}
      testID="member-manage-sheet"
      footer={
        confirming ? (
          <>
            <Pressable
              onPress={runConfirmedAction}
              disabled={busy}
              style={[
                alenioSheetStyles.primaryButton,
                confirming.kind === "remove" ? styles.dangerButton : null,
                busy ? alenioSheetStyles.primaryButtonDisabled : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${confirmLabel} for ${displayName}`}
              testID="member-manage-confirm"
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={alenioSheetStyles.primaryButtonText}>
                  {confirmLabel}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setConfirming(null)}
              disabled={busy}
              style={alenioSheetStyles.cancelButton}
              accessibilityRole="button"
              testID="member-manage-cancel"
            >
              <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </>
        ) : undefined
      }
    >
      {confirming ? (
        <AlenioSheetCard
          tint={confirming.kind === "remove" ? "danger" : "blue"}
          compact
        >
          <View style={styles.identity}>
            <UserAvatar
              user={member.user}
              size={42}
              radius={21}
              backgroundColor="#EEF2FF"
              resetKey={member.userId}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.identityName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.confirmBody}>{confirmBody}</Text>
            </View>
            <AlenioSheetIcon
              color={confirming.kind === "remove" ? "#EF4444" : "#4361EE"}
              compact
            >
              {confirming.kind === "remove" ? (
                <Trash2 size={15} color="#FFFFFF" strokeWidth={2.2} />
              ) : (
                <ShieldCheck size={15} color="#FFFFFF" strokeWidth={2.2} />
              )}
            </AlenioSheetIcon>
          </View>
        </AlenioSheetCard>
      ) : (
        <>
          <View style={styles.identity}>
            <UserAvatar
              user={member.user}
              size={40}
              radius={20}
              resetKey={member.userId}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.identityName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.identityMeta} numberOfLines={1}>
                {getWorkspaceRolePresentation(targetRole).label}
                {member.user.email ? ` · ${member.user.email}` : ""}
              </Text>
            </View>
          </View>

          {canChangeRole ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ROLE</Text>
              {EDITABLE_WORKSPACE_ROLES.map((role) => {
                const presentation = getWorkspaceRolePresentation(role);
                const selected = targetRole === role;
                return (
                  <Pressable
                    key={role}
                    disabled={selected}
                    onPress={() => setConfirming({ kind: "role", role })}
                    style={[
                      styles.roleRow,
                      selected ? styles.roleRowSelected : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Set role to ${presentation.label}`}
                    testID={`member-manage-role-${role}`}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.roleTitle}>{presentation.label}</Text>
                      <Text style={styles.roleDescription}>
                        {presentation.description}
                      </Text>
                    </View>
                    {selected ? (
                      <View style={styles.check}>
                        <Check size={12} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.section}>
            <Pressable
              onPress={() => {
                onClose();
                router.push({
                  pathname: "/person",
                  params: { teamId, userId: member.userId },
                });
              }}
              style={styles.actionRow}
              accessibilityRole="button"
              testID="member-manage-view-profile"
            >
              <UserRound size={16} color="#475569" strokeWidth={2.2} />
              <Text style={styles.actionLabel}>View profile</Text>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2.2} />
            </Pressable>

            {canRemove ? (
              <Pressable
                onPress={() => setConfirming({ kind: "remove" })}
                style={styles.actionRow}
                accessibilityRole="button"
                testID="member-manage-remove"
              >
                <Trash2 size={16} color="#DC2626" strokeWidth={2.2} />
                <Text style={[styles.actionLabel, styles.actionLabelDanger]}>
                  Remove from workspace
                </Text>
                <ChevronRight size={16} color="#F0A0A0" strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>

          {!canChangeRole && !canRemove ? (
            <Text style={styles.note}>
              {targetRole === "owner" || targetRole === "team_leader"
                ? "Owners and team leaders cannot be changed or removed here."
                : "Only workspace owners can change roles."}
            </Text>
          ) : null}
        </>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
  },
  identityName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  identityMeta: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: "#64748B",
  },
  confirmBody: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#667085",
  },
  section: { gap: 8, paddingBottom: 12 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: "#64748B",
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  roleRowSelected: { borderColor: "#4361EE", backgroundColor: "#F5F7FF" },
  roleTitle: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  roleDescription: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#64748B",
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4361EE",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  actionLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: "#334155" },
  actionLabelDanger: { color: "#DC2626" },
  dangerButton: { backgroundColor: "#DC2626" },
  note: {
    paddingBottom: 8,
    fontSize: 11,
    lineHeight: 15,
    color: "#8A94A8",
    textAlign: "center",
  },
});
