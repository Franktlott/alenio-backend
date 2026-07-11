import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Building2, Clock, UserPlus } from "lucide-react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SecurityFooter } from "./SecurityFooter";
import { welcomeActionStyles as styles } from "./WelcomeBottomSection";
import { authClient, clearAccessToken } from "@/lib/auth/auth-client";
import { clearMobileAuthCaches, markSessionSignedOut } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { api } from "@/lib/api/api";
import { WELCOME_UI } from "./welcome-ui";

type PendingRequest = {
  id: string;
  team: { name: string };
};

type Props = {
  pendingRequest?: PendingRequest | null;
};

export function WelcomeBottomSection({ pendingRequest }: Props) {
  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const cancelRequestMutation = useMutation({
    mutationFn: (requestId: string) => api.delete(`/api/join-requests/${requestId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] });
    },
  });

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    markSessionSignedOut();
    clearAccessToken();
    await clearMobileAuthCaches(queryClient);
    try {
      await authClient.signOut();
    } catch {
      // continue cleanup even if remote sign-out call fails
    }
    clearAccessToken();
    queryClient.clear();
    setActiveTeamId(null);
    router.replace("/welcome");
  };

  const handleCheckStatus = async () => {
    if (!pendingRequest) return;
    setIsCheckingStatus(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] }),
      ]);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleCancelRequest = () => {
    if (!pendingRequest || cancelRequestMutation.isPending) return;
    cancelRequestMutation.mutate(pendingRequest.id);
  };

  return (
    <>
      <View style={styles.bottomSection}>
        {pendingRequest ? (
          <>
            <View style={styles.pendingCard} testID="pending-request-banner">
              <View style={styles.pendingHeader}>
                <View style={styles.pendingStatusPill}>
                  <View style={styles.pendingStatusDot} />
                  <Text style={styles.pendingStatusLabel}>Pending review</Text>
                </View>
                <View style={styles.pendingIconWrap}>
                  <Clock size={16} color={WELCOME_UI.pendingAccent} strokeWidth={2.2} />
                </View>
              </View>

              <Text style={styles.pendingTitle}>Waiting for administrator approval</Text>
              <Text style={styles.pendingWorkspace} numberOfLines={2}>
                {pendingRequest.team.name}
              </Text>
              <Text style={styles.pendingCopy}>
                A workspace administrator must approve your request before you can access team tools and data.
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.primaryButton}
              accessibilityRole="button"
              accessibilityLabel="Check join request status"
              testID="check-status-button"
              onPress={handleCheckStatus}
              disabled={isCheckingStatus}
            >
              {isCheckingStatus ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryLabel}>Check status</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.cancelRequestButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel join request"
              testID="cancel-pending-button"
              onPress={handleCancelRequest}
              disabled={cancelRequestMutation.isPending}
            >
              {cancelRequestMutation.isPending ? (
                <ActivityIndicator color={WELCOME_UI.body} />
              ) : (
                <Text style={styles.cancelRequestText}>Cancel request</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.primaryButton}
              accessibilityRole="button"
              accessibilityLabel="Join an existing workspace"
              testID="join-workspace-button"
              onPress={() => router.push("/onboarding?mode=join")}
            >
              <UserPlus size={18} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.primaryLabel}>Join Workspace</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.secondaryButton}
              accessibilityRole="button"
              accessibilityLabel="Create a new workplace"
              testID="create-workplace-button"
              onPress={() => router.push("/onboarding?mode=create")}
            >
              <Building2 size={18} color="#4361EE" strokeWidth={2.2} />
              <Text style={styles.secondaryLabel}>Create a Workplace</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.footerWrap}>
        <SecurityFooter />
        <TouchableOpacity
          onPress={() => setShowSignOutConfirm(true)}
          style={styles.signOutButton}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          testID="welcome-sign-out-button"
          activeOpacity={0.8}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignOutConfirm(false)}
      >
        <Pressable style={styles.signOutBackdrop} onPress={() => setShowSignOutConfirm(false)}>
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.signOutCard}>
              <Text style={styles.signOutTitle}>Sign out?</Text>
              <Text style={styles.signOutCopy}>You can sign back in anytime with your email.</Text>
              <View style={styles.signOutActions}>
                <TouchableOpacity
                  onPress={() => setShowSignOutConfirm(false)}
                  style={styles.signOutCancel}
                  testID="welcome-cancel-sign-out"
                  activeOpacity={0.8}
                >
                  <Text style={styles.signOutCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSignOut}
                  style={styles.signOutConfirm}
                  testID="welcome-confirm-sign-out"
                  activeOpacity={0.92}
                >
                  <Text style={styles.signOutConfirmText}>Sign out</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
