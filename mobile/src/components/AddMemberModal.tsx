import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Search, UserPlus } from "lucide-react-native";
import { toast } from "burnt";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { isValidInviteEmail } from "@/lib/team-invite-errors";
import type { WorkspaceInviteRole } from "@/lib/workspace-members";
import { api } from "@/lib/api/api";
import { UserAvatar } from "@/components/UserAvatar";

type InviteCandidate = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
};

type PendingInvite =
  | { kind: "existing"; candidate: InviteCandidate }
  | { kind: "email"; email: string };

type Props = {
  visible: boolean;
  teamId: string;
  teamName: string;
  confirming: boolean;
  error?: string | null;
  onClose: () => void;
  /** Existing single-email callers remain supported. */
  onConfirm?: (email: string, role?: WorkspaceInviteRole) => void;
  onConfirmMany?: (emails: string[], role: WorkspaceInviteRole) => void;
  onClearError?: () => void;
};

export function AddMemberModal({
  visible,
  teamId,
  teamName,
  confirming,
  error,
  onClose,
  onConfirm,
  onConfirmMany,
  onClearError,
}: Props) {
  const [value, setValue] = useState<string>("");
  const [debouncedValue, setDebouncedValue] = useState("");
  const [selectedCandidate, setSelectedCandidate] =
    useState<InviteCandidate | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const email = value.trim().toLowerCase();

  const close = () => {
    setValue("");
    setDebouncedValue("");
    setSelectedCandidate(null);
    setPendingInvite(null);
    setLocalError(null);
    onClearError?.();
    onClose();
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value.trim()), 250);
    return () => clearTimeout(timer);
  }, [value]);

  const { data: candidates = [], isFetching: searching } = useQuery({
    queryKey: ["workspace-invite-candidates", teamId, debouncedValue],
    queryFn: () =>
      api.get<InviteCandidate[]>(
        `/api/teams/${teamId}/invite-candidates?q=${encodeURIComponent(debouncedValue)}`,
      ),
    enabled:
      visible &&
      Boolean(teamId) &&
      debouncedValue.length >= 2 &&
      !selectedCandidate &&
      !pendingInvite,
    staleTime: 15_000,
  });

  const addExistingMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/api/teams/${teamId}/invites/user`, { userId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      void queryClient.invalidateQueries({
        queryKey: ["workspace-invite-candidates", teamId],
      });
      toast({ title: "Member added", preset: "done" });
      close();
    },
    onError: (err: unknown) => {
      setLocalError(
        err instanceof Error
          ? err.message
          : "This person could not be added right now.",
      );
    },
  });
  const busy = confirming || addExistingMutation.isPending;
  const canSubmit = Boolean(selectedCandidate || isValidInviteEmail(email));

  useEffect(() => {
    if (!visible) {
      setValue("");
      setDebouncedValue("");
      setSelectedCandidate(null);
      setPendingInvite(null);
      setLocalError(null);
    }
  }, [visible]);

  const requestConfirmation = () => {
    if (!teamId) return;
    if (selectedCandidate) {
      setLocalError(null);
      setPendingInvite({ kind: "existing", candidate: selectedCandidate });
      return;
    }
    if (!email) return;
    if (!isValidInviteEmail(email)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    setLocalError(null);
    setPendingInvite({ kind: "email", email });
  };

  const confirmInvitation = () => {
    if (!pendingInvite || !teamId) return;
    setLocalError(null);
    if (pendingInvite.kind === "existing") {
      addExistingMutation.mutate(pendingInvite.candidate.id);
      return;
    }
    if (onConfirmMany) onConfirmMany([pendingInvite.email], "member");
    else onConfirm?.(pendingInvite.email, "member");
  };

  return (
    <AlenioBottomSheet
      visible={visible}
      title={pendingInvite ? "Confirm invitation" : "Invite member"}
      subtitle={
        pendingInvite
          ? "Review the details before continuing"
          : `Add someone to ${teamName}`
      }
      onClose={close}
      compact
      testID="add-member-modal"
      footer={
        <>
          <Pressable
            onPress={pendingInvite ? confirmInvitation : requestConfirmation}
            disabled={busy || (!pendingInvite && !canSubmit)}
            style={[
              alenioSheetStyles.primaryButton,
              busy || (!pendingInvite && !canSubmit)
                ? alenioSheetStyles.primaryButtonDisabled
                : null,
            ]}
            testID="add-member-confirm"
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={alenioSheetStyles.primaryButtonText}>
                {pendingInvite
                  ? pendingInvite.kind === "existing"
                    ? "Confirm and add"
                    : "Confirm and send"
                  : "Continue"}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              if (pendingInvite) {
                setPendingInvite(null);
                setLocalError(null);
                onClearError?.();
              } else {
                close();
              }
            }}
            disabled={busy}
            style={alenioSheetStyles.cancelButton}
            testID="add-member-cancel"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>
              {pendingInvite ? "Go back" : "Cancel"}
            </Text>
          </Pressable>
        </>
      }
    >
      {pendingInvite ? (
        <AlenioSheetCard compact>
          <View style={styles.confirmationHeader}>
            <AlenioSheetIcon compact>
              <UserPlus size={16} color="#FFFFFF" />
            </AlenioSheetIcon>
            <View style={styles.confirmationCopy}>
              <Text style={styles.confirmationTitle}>
                {pendingInvite.kind === "existing"
                  ? "Add this member?"
                  : "Send this invitation?"}
              </Text>
              <Text style={styles.confirmationSubtitle}>
                They’ll join {teamName} with the Member role.
              </Text>
            </View>
          </View>

          {pendingInvite.kind === "existing" ? (
            <View style={styles.confirmationPerson}>
              <UserAvatar
                user={{
                  image: pendingInvite.candidate.image,
                  name:
                    pendingInvite.candidate.name ??
                    pendingInvite.candidate.username ??
                    "Member",
                }}
                size={42}
              />
              <View style={styles.candidateCopy}>
                <Text style={styles.confirmationValue} numberOfLines={1}>
                  {pendingInvite.candidate.name ?? "Alenio member"}
                </Text>
                {pendingInvite.candidate.username ? (
                  <Text style={styles.candidateUsername} numberOfLines={1}>
                    @{pendingInvite.candidate.username}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.confirmationEmail}>
              <Text style={styles.confirmationLabel}>INVITATION EMAIL</Text>
              <Text style={styles.confirmationValue} numberOfLines={2}>
                {pendingInvite.email}
              </Text>
            </View>
          )}

          {error || localError ? (
            <View
              style={styles.fieldError}
              accessibilityRole="alert"
              testID="add-member-error"
            >
              <AlertCircle size={13} color="#C2413A" strokeWidth={2.2} />
              <Text style={styles.fieldErrorText}>{error ?? localError}</Text>
            </View>
          ) : null}
        </AlenioSheetCard>
      ) : (
        <>
          <AlenioSheetCard compact>
            <View
              style={[
                alenioSheetStyles.optionRow,
                alenioSheetStyles.optionRowCompact,
              ]}
            >
              <AlenioSheetIcon compact>
                <Search size={16} color="#FFFFFF" />
              </AlenioSheetIcon>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    alenioSheetStyles.optionTitle,
                    alenioSheetStyles.optionTitleCompact,
                  ]}
                >
                  Find someone
                </Text>
                <Text
                  style={[
                    alenioSheetStyles.optionSubtitle,
                    alenioSheetStyles.optionSubtitleCompact,
                  ]}
                >
                  Search Alenio or enter an email address.
                </Text>
              </View>
            </View>
            <TextInput
              value={value}
              onChangeText={(text) => {
                setValue(text);
                setSelectedCandidate(null);
                setLocalError(null);
                onClearError?.();
              }}
              placeholder="Name, @username, or email"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="send"
              onSubmitEditing={requestConfirmation}
              style={[alenioSheetStyles.fieldInput, { minHeight: 48 }]}
              testID="add-member-email"
            />
            {error || localError ? (
              <View
                style={styles.fieldError}
                accessibilityRole="alert"
                testID="add-member-error"
              >
                <AlertCircle size={13} color="#C2413A" strokeWidth={2.2} />
                <Text style={styles.fieldErrorText}>{error ?? localError}</Text>
              </View>
            ) : null}
          </AlenioSheetCard>

          {selectedCandidate ? (
            <View style={styles.selectedCard}>
              <UserAvatar
                user={{
                  image: selectedCandidate.image,
                  name:
                    selectedCandidate.name ??
                    selectedCandidate.username ??
                    "Member",
                }}
                size={38}
              />
              <View style={styles.candidateCopy}>
                <Text style={styles.candidateName} numberOfLines={1}>
                  {selectedCandidate.name ?? "Alenio member"}
                </Text>
                {selectedCandidate.username ? (
                  <Text style={styles.candidateUsername} numberOfLines={1}>
                    @{selectedCandidate.username}
                  </Text>
                ) : null}
              </View>
              <View style={styles.selectedCheck}>
                <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
              </View>
            </View>
          ) : debouncedValue.length >= 2 ? (
            <View style={styles.resultsCard}>
              {searching ? (
                <View style={styles.searchingRow}>
                  <ActivityIndicator size="small" color="#4361EE" />
                  <Text style={styles.searchingText}>Searching Alenio…</Text>
                </View>
              ) : candidates.length > 0 ? (
                candidates.map((candidate, index) => (
                  <View key={candidate.id}>
                    {index > 0 ? <View style={styles.resultDivider} /> : null}
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedCandidate(candidate);
                        setLocalError(null);
                      }}
                      style={styles.candidateRow}
                      activeOpacity={0.72}
                      accessibilityRole="button"
                      testID={`invite-candidate-${candidate.id}`}
                    >
                      <UserAvatar
                        user={{
                          image: candidate.image,
                          name:
                            candidate.name ?? candidate.username ?? "Member",
                        }}
                        size={36}
                      />
                      <View style={styles.candidateCopy}>
                        <Text style={styles.candidateName} numberOfLines={1}>
                          {candidate.name ?? "Alenio member"}
                        </Text>
                        {candidate.username ? (
                          <Text
                            style={styles.candidateUsername}
                            numberOfLines={1}
                          >
                            @{candidate.username}
                          </Text>
                        ) : null}
                      </View>
                      <UserPlus size={16} color="#5368E8" strokeWidth={2.2} />
                    </TouchableOpacity>
                  </View>
                ))
              ) : !isValidInviteEmail(email) ? (
                <Text style={styles.noResultsText}>No Alenio users found.</Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  confirmationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  confirmationCopy: {
    flex: 1,
  },
  confirmationTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#172033",
  },
  confirmationSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#7A8598",
  },
  confirmationPerson: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 13,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#F7F8FC",
  },
  confirmationEmail: {
    marginTop: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#F7F8FC",
  },
  confirmationLabel: {
    marginBottom: 3,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: "#8A94A6",
  },
  confirmationValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#172033",
  },
  fieldError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  fieldErrorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#A33D38",
  },
  resultsCard: {
    overflow: "hidden",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    backgroundColor: "#FFFFFF",
  },
  candidateRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  candidateCopy: {
    flex: 1,
    minWidth: 0,
  },
  candidateName: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "700",
    color: "#172033",
  },
  candidateUsername: {
    marginTop: 2,
    fontSize: 10.5,
    lineHeight: 13,
    color: "#8A94A6",
  },
  resultDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 57,
    backgroundColor: "#E8EDF3",
  },
  searchingRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  searchingText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#64748B",
  },
  noResultsText: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    textAlign: "center",
    fontSize: 11.5,
    color: "#8A94A6",
  },
  selectedCard: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D8DEFF",
    backgroundColor: "#F7F8FF",
  },
  selectedCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4361EE",
  },
});
